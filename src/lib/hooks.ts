import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { deleteBookFiles } from './epub';
import * as repo from './repo';
import { requestSync } from './sync';

export const keys = {
  books: ['books'] as const,
  book: (id: string) => ['book', id] as const,
  vocab: (bookId?: string) => ['vocab', bookId ?? 'all'] as const,
  word: (id: string) => ['word', id] as const,
  passages: (bookId?: string) => ['passages', bookId ?? 'all'] as const,
  search: (q: string) => ['search', q] as const,
};

export const useBooks = () => useQuery({ queryKey: keys.books, queryFn: repo.listBooks });
export const useBook = (id?: string) =>
  useQuery({ queryKey: keys.book(id ?? ''), queryFn: () => repo.getBook(id!), enabled: !!id });
export const useVocabulary = (bookId?: string) =>
  useQuery({ queryKey: keys.vocab(bookId), queryFn: () => repo.listVocabulary(bookId) });
export const useWord = (id?: string) =>
  useQuery({ queryKey: keys.word(id ?? ''), queryFn: () => repo.getVocabulary(id!), enabled: !!id });
export const usePassages = (bookId?: string) =>
  useQuery({ queryKey: keys.passages(bookId), queryFn: () => repo.listPassages(bookId) });
export const useSearch = (q: string) =>
  useQuery({ queryKey: keys.search(q), queryFn: () => repo.searchAll(q), enabled: q.trim().length > 0 });

/** Call after any local write: refreshes cached queries and schedules a cloud sync. */
export function useAfterWrite() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries();
    requestSync();
  }, [qc]);
}

export function useDeleteBook() {
  const after = useAfterWrite();
  return useMutation({
    mutationFn: async (book: { id: string; filePath: string }) => {
      await repo.deleteBook(book.id);
      deleteBookFiles(book.filePath);
    },
    onSuccess: after,
  });
}

export function useDeleteWord() {
  const after = useAfterWrite();
  return useMutation({ mutationFn: repo.deleteVocabulary, onSuccess: after });
}

export function useDeletePassage() {
  const after = useAfterWrite();
  return useMutation({ mutationFn: repo.deletePassage, onSuccess: after });
}

export function useRenamePassage() {
  const after = useAfterWrite();
  return useMutation({
    mutationFn: (v: { id: string; title: string }) => repo.renamePassage(v.id, v.title),
    onSuccess: after,
  });
}

export function useUpdateMeaning() {
  const after = useAfterWrite();
  return useMutation({
    mutationFn: (v: { id: string; meaning: string }) => repo.updateVocabularyMeaning(v.id, v.meaning),
    onSuccess: after,
  });
}
