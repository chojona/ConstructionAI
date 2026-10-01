export const sidebarStorageKey = "construction-ai.sidebar-collapsed";

export function readSidebarCollapsed(storage: Pick<Storage, "getItem">) {
  try {
    return storage.getItem(sidebarStorageKey) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(storage: Pick<Storage, "setItem">, collapsed: boolean) {
  storage.setItem(sidebarStorageKey, collapsed ? "1" : "0");
}
