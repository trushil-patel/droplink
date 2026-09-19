// Match object identity, not name/size: a newly selected copy is a new queue item.
export function removeTransferredFile<T>(files: T[], transferred: T): T[] {
  const index = files.indexOf(transferred);
  return index < 0 ? files : files.filter((_, position) => position !== index);
}
