export type DownloadSource = "JM" | "Pica";
export const downloadSelectionLimit = 500;
export const downloadPreparationChunk = 20;
export interface DownloadScope {
  source: DownloadSource;
  sessionId: string;
}
export interface DownloadContext {
  scope: DownloadScope;
  rootId: string;
  generation: number;
}
export type DownloadContexts = Record<DownloadSource, DownloadContext | null>;
export interface DownloadPlan {
  planId: string;
  revision: number;
  source: DownloadSource;
  workId: string;
  title: string;
  authors: string[];
  destinationDisplay: string;
  rootId: string;
  generation: number;
}
export interface DownloadBatchPlan {
  batchId: string | null;
  plans: DownloadPlan[];
  issues: { input: string; errorCode: string }[];
}
export interface DownloadSelectionPlan extends DownloadBatchPlan {
  batchIds: string[];
}
export interface DownloadSelectionInput {
  source: DownloadSource;
  input: string;
}
export interface DownloadSubmissionItem extends DownloadSelectionInput {
  workId: string | null;
}
export interface DownloadSubmissionFailure extends DownloadSubmissionItem {
  errorCode: string;
  message: string;
}
export interface DownloadSubmissionResult {
  accepted: (DownloadSubmissionItem & {
    taskId: string | null;
    outcome: "queued" | "existing" | "retried" | "resumed" | "present";
  })[];
  failed: DownloadSubmissionFailure[];
}
export interface DownloadTaskRevision {
  taskId: string;
  expectedRevision: number;
}
export type DownloadAction =
  "pause" | "resume" | "retry" | "abandon" | "cleanup";
export type DownloadLocalFiles =
  "present" | "missing" | "incomplete" | "unavailable";
export type DownloadPhase =
  | "queued"
  | "downloading"
  | "verifying"
  | "saving"
  | "paused"
  | "error"
  | "downloaded"
  | "abandoned";
export interface DownloadTask {
  id: string;
  revision: number;
  source: DownloadSource;
  workId: string;
  title: string;
  tags?: string[];
  rootId?: string;
  phase: DownloadPhase;
  filesDone: number;
  filesTotal: number | null;
  bytesDone: number;
  errorCode: string | null;
  allowedActions: DownloadAction[];
  libraryEntryId: string | null;
  localFiles: DownloadLocalFiles | null;
  updatedAt: number;
  destinationDisplay: string;
}
export interface DownloadSnapshot {
  revision: number;
  tasks: DownloadTask[];
}
export interface DownloadRootCheck {
  verified: number;
  missing: number;
  changed: number;
  skipped: number;
  snapshot: DownloadSnapshot;
}
export interface DownloadInventorySnapshot {
  revision: number;
  libraryRevision: number;
  rootId: string | null;
  items: {
    source: DownloadSource;
    workId: string;
    libraryEntryId: string;
    localFiles: DownloadLocalFiles;
  }[];
}
export const emptyDownloadInventory = (): DownloadInventorySnapshot => ({
  revision: 0,
  libraryRevision: 0,
  rootId: null,
  items: [],
});
/**
 * Whether a re-read inventory says exactly what the held one says. The
 * inventory is re-read on every page switch and window focus; keeping the held
 * object then spares every page that compares it by identity a full redraw.
 */
export function sameDownloadInventory(
  held: DownloadInventorySnapshot,
  read: DownloadInventorySnapshot,
): boolean {
  if (
    held.revision !== read.revision ||
    held.libraryRevision !== read.libraryRevision ||
    held.rootId !== read.rootId ||
    held.items.length !== read.items.length
  )
    return false;
  return held.items.every((item, index) => {
    const other = read.items[index];
    return (
      item.source === other.source &&
      item.workId === other.workId &&
      item.libraryEntryId === other.libraryEntryId &&
      item.localFiles === other.localFiles
    );
  });
}
export interface DownloadAdapter {
  inventory(): Promise<DownloadInventorySnapshot>;
  read(recheckFiles?: boolean): Promise<DownloadSnapshot>;
  prepare(context: DownloadContext, input: string): Promise<DownloadPlan>;
  confirm(planId: string, expectedRevision: number): Promise<DownloadSnapshot>;
  prepareBatch(
    context: DownloadContext,
    inputs: string[],
    retainedBatchIds?: string[],
  ): Promise<DownloadBatchPlan>;
  confirmBatch(batchId: string): Promise<DownloadSnapshot>;
  confirmSelection(batchIds: string[]): Promise<DownloadSnapshot>;
  cancelBatch(): Promise<void>;
  pauseAll(): Promise<DownloadSnapshot>;
  resumeMany(
    scope: DownloadScope,
    tasks: DownloadTaskRevision[],
  ): Promise<DownloadSnapshot>;
  removeHistory(tasks: DownloadTaskRevision[]): Promise<DownloadSnapshot>;
  verifyRoot(): Promise<DownloadRootCheck>;
  control(
    scope: DownloadScope,
    taskId: string,
    expectedRevision: number,
    action: DownloadAction,
  ): Promise<DownloadSnapshot>;
}
export const emptyDownloads = (): DownloadSnapshot => ({
  revision: 0,
  tasks: [],
});
