// 浏览器的选目录窗口不交出磁盘路径。能跨刷新记住的是目录句柄本身。
const DB_NAME = "df-wallet-folder";
const STORE_NAME = "directory";
const RECORD_KEY = "selected";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("打不开目录缓存"));
  });
}

export async function loadWalletDirectory(): Promise<
  FileSystemDirectoryHandle | undefined
> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(RECORD_KEY);
    request.onsuccess = () => {
      resolve(request.result as FileSystemDirectoryHandle | undefined);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("读不到目录缓存"));
  });
}

type PermittedDirectory = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: {
    mode: "read";
  }) => Promise<PermissionState>;
};

/** 读文件前先问权限。导入按钮的点击已经是用户动作，这时才可以申请。 */
export async function directoryPermission(
  handle: FileSystemDirectoryHandle,
  request: boolean,
): Promise<PermissionState> {
  const permitted = handle as PermittedDirectory;
  const ask = request ? permitted.requestPermission : permitted.queryPermission;
  if (!ask) {
    return "granted";
  }
  return ask.call(permitted, { mode: "read" });
}

export async function saveWalletDirectory(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(handle, RECORD_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("写不进目录缓存"));
  });
}
