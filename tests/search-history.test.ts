import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSearchHistorySchema,
  searchHistoryQuerySchema,
  searchHistoryIdParamSchema,
} from '../src/modules/search-history/search-history.validation.js';
import { SearchHistoryService } from '../src/modules/search-history/search-history.service.js';
import type { SearchHistoryRepository } from '../src/modules/search-history/search-history.repository.js';

describe('Search History Module', () => {
  describe('Zod Validation Schemas', () => {
    it('validates a valid create search history payload', () => {
      const valid = {
        title: 'Phoenix Park Visitor Centre',
        subtitle: 'Phoenix Park, Dublin, Ireland',
        placeId: 'place_123',
        latitude: 53.3559,
        longitude: -6.3298,
      };

      const result = createSearchHistorySchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects a payload with an empty title', () => {
      const invalid = {
        title: '',
        subtitle: 'Dublin',
      };

      const result = createSearchHistorySchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Title is required');
      }
    });

    it('allows optional and null fields in payload', () => {
      const minimal = {
        title: "Mum's house",
        subtitle: null,
        latitude: null,
        longitude: null,
      };

      const result = createSearchHistorySchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it('coerces and validates query limit correctly', () => {
      const parsedWithDefault = searchHistoryQuerySchema.safeParse({});
      expect(parsedWithDefault.success).toBe(true);
      if (parsedWithDefault.success) {
        expect(parsedWithDefault.data.limit).toBeUndefined();
      }

      const parsedWithString = searchHistoryQuerySchema.safeParse({ limit: '5' });
      expect(parsedWithString.success).toBe(true);
      if (parsedWithString.success) {
        expect(parsedWithString.data.limit).toBe(5);
      }

      const parsedOutOfRange = searchHistoryQuerySchema.safeParse({ limit: '100' });
      expect(parsedOutOfRange.success).toBe(false);
    });

    it('validates id parameter schema', () => {
      expect(searchHistoryIdParamSchema.safeParse({ id: '12' }).success).toBe(true);
      expect(searchHistoryIdParamSchema.safeParse({ id: '' }).success).toBe(false);
    });
  });

  describe('SearchHistoryService', () => {
    let mockRepo: Partial<SearchHistoryRepository>;
    let service: SearchHistoryService;

    const mockDbItem = {
      id: 1,
      user_id: 10,
      title: 'Grand Canal Dock',
      subtitle: 'Dublin 4, Ireland',
      place_id: 'dock_001',
      latitude: 53.3444,
      longitude: -6.2392,
      created_at: '2026-11-06T10:00:00Z',
      updated_at: '2026-11-06T10:00:00Z',
    };

    beforeEach(() => {
      mockRepo = {
        getRecentSearches: vi.fn().mockResolvedValue([mockDbItem]),
        saveSearch: vi.fn().mockResolvedValue(mockDbItem),
        deleteById: vi.fn().mockResolvedValue(true),
        clearAll: vi.fn().mockResolvedValue(3),
      };
      service = new SearchHistoryService(mockRepo as SearchHistoryRepository);
    });

    it('retrieves recent searches and formats camelCase fields', async () => {
      const results = await service.getRecentSearches(10, 5);

      expect(mockRepo.getRecentSearches).toHaveBeenCalledWith(10, 5);
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({
        id: 1,
        userId: 10,
        title: 'Grand Canal Dock',
        subtitle: 'Dublin 4, Ireland',
        placeId: 'dock_001',
        latitude: 53.3444,
        longitude: -6.2392,
        createdAt: '2026-11-06T10:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      });
    });

    it('saves a search item and returns formatted response', async () => {
      const saved = await service.saveSearch(10, {
        title: 'Grand Canal Dock',
        subtitle: 'Dublin 4, Ireland',
        latitude: 53.3444,
        longitude: -6.2392,
      });

      expect(mockRepo.saveSearch).toHaveBeenCalledWith(10, expect.any(Object));
      expect(saved.title).toBe('Grand Canal Dock');
      expect(saved.userId).toBe(10);
    });

    it('deletes an individual search item', async () => {
      const success = await service.deleteSearchItem(10, 1);
      expect(mockRepo.deleteById).toHaveBeenCalledWith(10, 1);
      expect(success).toBe(true);
    });

    it('clears all search history for a user', async () => {
      const count = await service.clearHistory(10);
      expect(mockRepo.clearAll).toHaveBeenCalledWith(10);
      expect(count).toBe(3);
    });
  });
});

