function contextual(error: unknown, action: string) {
  const message = new Error(`${action}: ${String(error)}`, { cause: error });
  if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") message.name = error.name;
  return message;
}
export class MediaStorage {
  private async root() {
    let root: FileSystemDirectoryHandle;
    try { root = await navigator.storage.getDirectory(); }
    catch (error) { throw contextual(error, "OPFS root"); }
    try { return await (await root.getDirectoryHandle("loud-books", { create: true })).getDirectoryHandle("v1", { create: true }); }
    catch (error) { throw contextual(error, "OPFS application directory"); }
  }
  private async parent(path: string, create = false) {
    const parts = path.split("/").filter(Boolean);
    if (!parts.length || parts.some(part => part === "." || part === "..")) throw new Error("Invalid storage path");
    const name = parts.pop()!;
    let directory = await this.root();
    for (const part of parts) {
      try { directory = await directory.getDirectoryHandle(part, { create }); }
      catch (error) { if (!create) throw error; throw contextual(error, "OPFS staging directory"); }
    }
    return { directory, name };
  }
  async handle(path: string, create = false) {
    const { directory, name } = await this.parent(path, create);
    try { return await directory.getFileHandle(name, { create }); }
    catch (error) { if (!create) throw error; throw contextual(error, "OPFS file handle"); }
  }
  async read(path: string) { return (await this.handle(path)).getFile(); }
  async delete(path: string) {
    try { const { directory, name } = await this.parent(path); await directory.removeEntry(name, { recursive: true }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error; }
  }
  async list(path: string): Promise<string[]> {
    let dir = await this.root();
    try {
      for (const part of path.split("/").filter(Boolean)) dir = await dir.getDirectoryHandle(part);
      const names: string[] = [];
      for await (const [name] of dir.entries()) names.push(name);
      return names;
    } catch (error) { if (error instanceof DOMException && error.name === "NotFoundError") return []; throw error; }
  }
  async usage(path: string): Promise<number> {
    try { return (await this.read(path)).size; } catch (error) {
      if (!(error instanceof DOMException && (error.name === "TypeMismatchError" || error.name === "NotFoundError"))) throw error;
      const names = await this.list(path);
      return (await Promise.all(names.map(name => this.usage(`${path}/${name}`)))).reduce((a, b) => a + b, 0);
    }
  }
}
