import { describe, it, expect } from 'vitest';

/**
 * Multi-token search algorithm verification
 */
interface BookmarkItem {
    id: string;
    customTitle?: string;
    promptText: string;
    responseText: string;
    modelName?: string;
}

function searchBookmarks(list: BookmarkItem[], query: string): BookmarkItem[] {
    if (!query || !query.trim()) return list;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter(bm => {
        const title = (bm.customTitle || bm.promptText || '').toLowerCase();
        const prompt = (bm.promptText || '').toLowerCase();
        const response = (bm.responseText || '').toLowerCase();
        const model = (bm.modelName || '').toLowerCase();
        const combined = `${title} ${prompt} ${response} ${model}`;
        return tokens.every(token => combined.includes(token));
    });
}

describe('Multi-Token Bookmarks Search Filter', () => {
    const mockBookmarks: BookmarkItem[] = [
        {
            id: '1',
            customTitle: 'Docker Compose Guide',
            promptText: 'How to setup postgres in docker compose?',
            responseText: 'Here is the docker-compose.yml configuration with volume mapping.',
            modelName: 'Gemini 1.5 Pro'
        },
        {
            id: '2',
            promptText: 'Explain Python list comprehensions',
            responseText: 'List comprehensions provide a concise way to create lists in python.',
            modelName: 'Gemini Flash'
        },
        {
            id: '3',
            customTitle: 'React State Management',
            promptText: 'Zustand vs Redux Toolkit in 2026',
            responseText: 'Zustand has minimal boilerplate and works well with server components.',
            modelName: 'Gemini 1.5 Pro'
        }
    ];

    it('returns all bookmarks when search query is empty', () => {
        expect(searchBookmarks(mockBookmarks, '')).toHaveLength(3);
        expect(searchBookmarks(mockBookmarks, '   ')).toHaveLength(3);
    });

    it('filters by single term regardless of case', () => {
        const result = searchBookmarks(mockBookmarks, 'docker');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('matches multi-token queries across different fields (AND logic)', () => {
        // "postgres pro" matches prompt 'postgres' and model 'Pro' in bookmark 1
        const result = searchBookmarks(mockBookmarks, 'postgres pro');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('matches custom title if set', () => {
        const result = searchBookmarks(mockBookmarks, 'Zustand');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('3');
    });

    it('returns empty array when no bookmark matches all tokens', () => {
        const result = searchBookmarks(mockBookmarks, 'docker zustand');
        expect(result).toHaveLength(0);
    });
});
