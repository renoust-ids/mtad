import * as updater from "./updater";
import * as appWindow from "./appWindow";
import * as quickStart from "./quickStart";
import electron, {
  MenuItem,
  BrowserWindow,
  KeyboardEvent,
  MenuItemConstructorOptions,
} from "electron";

const Menu = electron.Menu;
const dialog = electron.dialog;
const isDarwin = process.platform === "darwin";
let appMenu: electron.Menu | null = null;
const separatorMenuItem: MenuItemConstructorOptions = {
  type: "separator",
};

const aboutTadMenuItem = () => {
  return {
    label: "About MTad",
    click: () => {
      dialog.showMessageBox({
        type: "info",
        title: "About MTad",
        message: "MTad",
        detail:
          "Version 0.0.2\n\nForked from TAD Version 31.0.1 (31.0.1)\nhttps://github.com/antonycourtney/tad",
        buttons: ["OK"],
        noLink: true,
      });
    },
  };
};

const checkForUpdateMenuItem = () => {
  return {
    label: "Check for Updates",
    click: updater.checkForUpdates,
  };
};

export const createMenu = () => {
  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: "New MTad Window",
      accelerator: "CmdOrCtrl+N",
      click: (item: MenuItem, focusedWindow: BrowserWindow | undefined) => {
        appWindow.newWindow(focusedWindow);
      },
    },

    {
      label: "Open File...",
      accelerator: "CmdOrCtrl+O",
      click: (item: MenuItem, focusedWindow: BrowserWindow | undefined) => {
        appWindow.openDialog("openFile", focusedWindow);
      },
    },
    {
      label: "Open Directory...",
      accelerator: "CmdOrCtrl+O",
      click: (item: MenuItem, focusedWindow: BrowserWindow | undefined) => {
        appWindow.openDialog("openDirectory", focusedWindow);
      },
    },

    separatorMenuItem,
    {
      label: "Save As...",
      accelerator: "Shift+CmdOrCtrl+S",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow | undefined,
        event: KeyboardEvent
      ) => {
        appWindow.saveAsDialog();
      },
    },
    {
      label: "Export...",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow | undefined,
        event: KeyboardEvent
      ) => {
        if (focusedWindow) {
          appWindow.beginExport(focusedWindow);
        }
      },
    },
    {
      label: "Join CSV...",
      accelerator: "CmdOrCtrl+J",
      click: (item: MenuItem, focusedWindow: BrowserWindow | undefined) => {
        if (focusedWindow) {
          focusedWindow.webContents.send("start-csv-join");
        }
      },
    },

    /*
    {
      label: "Export Filtered CSV...",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow | undefined,
        event: KeyboardEvent
      ) => {
        if (focusedWindow) {
          appWindow.exportFiltered(focusedWindow);
        }
      },
    },
*/
  ];

  if (!isDarwin) {
    fileSubmenu.push(separatorMenuItem);
    fileSubmenu.push({
      role: "quit",
    });
  }

  const editSubmenu: MenuItemConstructorOptions[] = [
    { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
    { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
    { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
  ];
  const viewSubmenu: MenuItemConstructorOptions[] = [
    { label: "Zoom Reset", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
    { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", role: "zoomIn" },
    { label: "Zoom Out", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
  ];
  const analyticsSubmenu: MenuItemConstructorOptions[] = [
  {
    label: "Distribution",
    click: (item: MenuItem, focusedWindow: BrowserWindow | undefined) => {
      focusedWindow?.webContents.send("open-column-histogram", {});
    },
  },
  {
    label: "Scatter Plot Matrix",
    click: (item: MenuItem, focusedWindow: BrowserWindow | undefined) => {
      focusedWindow?.webContents.send("open-splom", {});
    },
  },
  {
    label: "Scatter Plot",
    click: (item: MenuItem, focusedWindow: BrowserWindow | undefined) => {
      focusedWindow?.webContents.send("open-scatter-plot", {});
    },
  },
];
  const debugSubmenu: MenuItemConstructorOptions[] = [
    {
      role: "toggleDevTools",
    },
    {
      label: "Show Hidden Columns",
      type: "checkbox",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow | undefined,
        event: KeyboardEvent
      ) => {
        focusedWindow?.webContents.send("set-show-hidden-cols", item.checked);
      },
    },
  ];
  let helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: "Quick Start Guide",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow | undefined,
        event: KeyboardEvent
      ) => {
        quickStart.showQuickStart();
      },
    },
    {
      label: "Send Feedback / Bug Reports",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow | undefined,
        event: KeyboardEvent
      ) => {
        electron.shell.openExternal("mailto:tad-feedback@tadviewer.com");
      },
    },
    separatorMenuItem,
    checkForUpdateMenuItem(),
  ];
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: fileSubmenu,
    },
    {
      label: "Edit",
      submenu: editSubmenu,
    },
    {
      label: "View",
      submenu: viewSubmenu,
    },
    {
      label: "Analytics",
      submenu: analyticsSubmenu,
    },
  ];

  if (process.env.NODE_ENV === "development") {
    template.push({
      label: "Debug",
      submenu: debugSubmenu as any,
    });
  }

  template.push({
    label: "Help",
    submenu: helpSubmenu,
  });

  if (isDarwin) {
    template.unshift({
      label: "MTad",
      // ignored on Mac OS; comes from plist
      submenu: [
        aboutTadMenuItem(),
        separatorMenuItem,
        {
          role: "quit",
        },
      ] as any,
    });
  }

  let oldMenu = appMenu;
  appMenu = Menu.buildFromTemplate(template as any);
  Menu.setApplicationMenu(appMenu);
};
