import * as React from "react";
import { Sidebar } from "./Sidebar";
import { StateRef, mutableGet } from "oneref";
import { AppState } from "../AppState";
import * as reltab from "reltab";
import * as log from "loglevel";
import _, { throttle } from "lodash";

import {
  Button,
  Classes,
  Dialog,
  HTMLSelect,
  Icon,
  Intent,
  TreeNodeInfo,
  Position,
  Tooltip,
  Tree,
  IconName,
} from "@blueprintjs/core";
import { useState, useReducer, useRef, useEffect } from "react";
import {
  DataSourceKind,
  DataSourceNode,
  DataSourcePath,
  DataSourceId,
  DataSourceConnection,
} from "reltab";
import { actions } from "../tadviewer";

export interface DataSourceSidebarProps {
  expanded: boolean;
  stateRef: StateRef<AppState>;
  onGetXlsxSheets?: (dsPath: DataSourcePath) => Promise<string[]>;
}

const dataKindIcon = (dsKind: DataSourceKind): IconName => {
  switch (dsKind) {
    case "Database":
      return "database";
    case "Dataset":
      return "folder-open";
    case "Table":
      return "th";
    case "File":
      return "document";
    case "Directory":
      return "folder-close";
    default:
      throw new Error("dataKindIcon: unknown kind '" + dsKind + "'");
  }
};

type DSTreeNodeData = {
  dsc: DataSourceConnection;
  dsPath: DataSourcePath;
  dsNode: DataSourceNode;
};

type DSTreeNodeInfo = TreeNodeInfo<DSTreeNodeData>;

const dsNodeTreeNode = (
  dsc: DataSourceConnection,
  dsPath: DataSourcePath,
  dsNode: DataSourceNode
): DSTreeNodeInfo => {
  const ret: DSTreeNodeInfo = {
    icon: dataKindIcon(dsNode.kind),
    id: JSON.stringify(dsPath),
    label: dsNode.displayName,
    nodeData: { dsc, dsPath, dsNode },
    hasCaret: dsNode.isContainer,
  };
  if (dsNode.description) {
    ret.secondaryLabel = (
      <Tooltip usePortal={true} boundary="window" content={dsNode.description}>
        <Icon icon="eye-open" />
      </Tooltip>
    );
  }
  return ret;
};

const extendDSPath = (basePath: DataSourcePath, item: string) => ({
  ...basePath,
  path: basePath.path.concat([item]),
});

type RootNodeMap = { [resourceId: string]: DSTreeNodeInfo };

export const DataSourceSidebar: React.FC<DataSourceSidebarProps> = ({
  expanded,
  stateRef,
  onGetXlsxSheets,
}) => {
  const [initialized, setInitialized] = useState(false);
  const [treeState, setTreeState] = useState<DSTreeNodeInfo[]>([]);
  const [rootNodeMap, setRootNodeMap] = useState<RootNodeMap>({});
  const [selectedNode, setSelectedNode] = useState<DSTreeNodeInfo | null>(null);
  // pending sheet selection for a multi-sheet workbook being opened
  const [sheetPick, setSheetPick] = useState<{
    dsPath: DataSourcePath;
    sheets: string[];
    sheet: string;
  } | null>(null);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const throttledRefresh = useRef(
    throttle(async function refreshDataSources(): Promise<void> {
      const appState = mutableGet(stateRef);
      const rtc = appState.rtc;
      let dirty = false;
      let newContainers: DSTreeNodeInfo[] = [];
      try {
        const nextNodeMap = Object.assign(rootNodeMap) as RootNodeMap;
        const rootSources = await rtc.getDataSources();
        const rootNodes = await Promise.all(
          rootSources.map(async (sourceId) => {
            const sourceIdStr = JSON.stringify(sourceId);
            let rootTreeNode = nextNodeMap[sourceIdStr];
            if (!rootTreeNode) {
              const dsc = await rtc.connect(sourceId);
              const rootNode = await dsc.getRootNode();
              const rootPath: DataSourcePath = {
                sourceId,
                path: ["."],
              };
              /*
              log.debug(
                "DataSourceSidebar: creating root node for",
                sourceIdStr,
                rootPath,
                rootNode
              );
              */
              rootTreeNode = dsNodeTreeNode(dsc, rootPath, rootNode);
              nextNodeMap[sourceIdStr] = rootTreeNode;
              if (rootNode.isContainer) {
                newContainers.push(rootTreeNode);
              }
              dirty = true;
            }
            return rootTreeNode;
          })
        );
        if (dirty) {
          setTreeState(rootNodes);
          setRootNodeMap(nextNodeMap);
          for (const cNode of newContainers) {
            handleNodeExpand(cNode);
          }
        }
      } catch (err) {
        console.error("error refreshing data sources: ", err);
      }
    }, 500)
  );

  useEffect(() => {
    throttledRefresh.current();
  });

  const handleNodeCollapse = (treeNode: DSTreeNodeInfo) => {
    treeNode.isExpanded = false;
    forceUpdate();
  };
  const handleNodeExpand = async (treeNode: DSTreeNodeInfo) => {
    const { dsPath, dsc, dsNode } = treeNode.nodeData!;
    const appState = mutableGet(stateRef);
    const childNodes = await dsc.getChildren(dsPath);
    treeNode.childNodes = childNodes.map((childNode) => {
      const childPath = extendDSPath(dsPath, childNode.id);
      return dsNodeTreeNode(dsc, childPath, childNode);
    });
    treeNode.isExpanded = true;
    forceUpdate();
  };

  const selectTreeNode = (treeNode: DSTreeNodeInfo) => {
    if (selectedNode != null) {
      selectedNode.isSelected = false;
    }
    treeNode.isSelected = true;
    setSelectedNode(treeNode);
    forceUpdate();
  };

  const openNode = (dsPath: DataSourcePath) => {
    actions.openDataSourcePath(dsPath, stateRef);
  };

  const handleNodeClick = async (
    treeNode: DSTreeNodeInfo,
    _nodePath: any[],
    e: React.MouseEvent<HTMLElement>
  ) => {
    const { dsPath, dsNode } = treeNode.nodeData!;
    if (dsNode.kind === "Table" || dsNode.kind === "File") {
      if (
        dsNode.kind === "File" &&
        dsPath.path[dsPath.path.length - 1].toLowerCase().endsWith(".xlsx") &&
        onGetXlsxSheets
      ) {
        try {
          const sheets = await onGetXlsxSheets(dsPath);
          if (sheets.length > 1) {
            // defer opening until the user picks a sheet
            setSheetPick({ dsPath, sheets, sheet: sheets[0] });
            selectTreeNode(treeNode);
            return;
          }
        } catch (err) {
          log.error("error enumerating xlsx sheets: ", err);
        }
      }
      openNode(dsPath);
    }
    selectTreeNode(treeNode);
  };

  const confirmSheetPick = () => {
    if (!sheetPick) {
      return;
    }
    const { dsPath, sheet } = sheetPick;
    setSheetPick(null);
    const sheetPath: DataSourcePath = { ...dsPath, sheet };
    openNode(sheetPath);
  };

  const cancelSheetPick = () => {
    setSheetPick(null);
  };

  return (
    <Sidebar expanded={expanded}>
      <Tree
        contents={treeState}
        onNodeCollapse={handleNodeCollapse}
        onNodeExpand={handleNodeExpand}
        onNodeClick={handleNodeClick}
      />
      <Dialog
        isOpen={sheetPick != null}
        title="Select worksheet"
        onClose={cancelSheetPick}
        canOutsideClickClose={false}
      >
        <div className={Classes.DIALOG_BODY}>
          {sheetPick && (
            <label htmlFor="sheet-pick-select" style={{ marginBottom: 6 }}>
              Sheet:
              <HTMLSelect
                id="sheet-pick-select"
                fill
                value={sheetPick.sheet}
                onChange={(e) =>
                  setSheetPick({ ...sheetPick, sheet: e.target.value })
                }
                options={sheetPick.sheets.map((s) => ({
                  label: s,
                  value: s,
                }))}
              />
            </label>
          )}
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button onClick={cancelSheetPick}>Cancel</Button>
            <Button
              intent={Intent.PRIMARY}
              onClick={confirmSheetPick}
              disabled={sheetPick == null}
            >
              Open
            </Button>
          </div>
        </div>
      </Dialog>
    </Sidebar>
  );
};

const INITIAL_STATE: DSTreeNodeInfo[] = [
  {
    id: 0,
    hasCaret: true,
    icon: "folder-close",
    label: "Folder 0",
  },
  {
    id: 1,
    icon: "folder-close",
    isExpanded: true,
    label: (
      <Tooltip content="I'm a folder <3" position={Position.RIGHT}>
        Folder 1
      </Tooltip>
    ),
    childNodes: [
      {
        id: 2,
        icon: "document",
        label: "Item 0",
        secondaryLabel: (
          <Tooltip content="An eye!">
            <Icon icon="eye-open" />
          </Tooltip>
        ),
      },
      {
        id: 3,
        icon: (
          <Icon
            icon="tag"
            intent={Intent.PRIMARY}
            className={Classes.TREE_NODE_ICON}
          />
        ),
        label:
          "Organic meditation gluten-free, sriracha VHS drinking vinegar beard man.",
      },
      {
        id: 4,
        hasCaret: true,
        icon: "folder-close",
        label: (
          <Tooltip content="foo" position={Position.RIGHT}>
            Folder 2
          </Tooltip>
        ),
        childNodes: [
          { id: 5, label: "No-Icon Item" },
          { id: 6, icon: "tag", label: "Item 1" },
          {
            id: 7,
            hasCaret: true,
            icon: "folder-close",
            label: "Folder 3",
            childNodes: [
              { id: 8, icon: "document", label: "Item 0" },
              { id: 9, icon: "tag", label: "Item 1" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 2,
    hasCaret: true,
    icon: "folder-close",
    label: "Super secret files",
    disabled: true,
  },
];
