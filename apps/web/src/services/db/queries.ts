import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./database";

export const useBooks = () => useLiveQuery(() => db.books.toArray(), []);
export const useBook = (id: string) => useLiveQuery(() => db.books.get(id), [id]);
export const useChapters = (id: string) => useLiveQuery(() => db.chapters.where("bookId").equals(id).sortBy("order"), [id]);
export const useSettings = () => useLiveQuery(() => db.settings.get("settings"), []);
export const useProgress = (id: string) => useLiveQuery(() => db.progress.get(id), [id]);
