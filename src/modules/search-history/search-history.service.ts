import searchHistoryRepository, { SearchHistoryRepository } from './search-history.repository.js';
import type { CreateSearchHistoryDTO, FormattedSearchHistory, SearchHistory } from './search-history.types.js';

export class SearchHistoryService {
  constructor(private readonly repository: SearchHistoryRepository = searchHistoryRepository) {}

  private formatItem(item: SearchHistory): FormattedSearchHistory {
    return {
      id: item.id,
      userId: item.user_id,
      title: item.title,
      subtitle: item.subtitle,
      placeId: item.place_id,
      latitude: item.latitude !== null ? Number(item.latitude) : null,
      longitude: item.longitude !== null ? Number(item.longitude) : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  async getRecentSearches(userId: number, limit = 5): Promise<FormattedSearchHistory[]> {
    const items = await this.repository.getRecentSearches(userId, limit);
    return items.map((i) => this.formatItem(i));
  }

  async saveSearch(userId: number, data: CreateSearchHistoryDTO): Promise<FormattedSearchHistory> {
    const item = await this.repository.saveSearch(userId, data);
    return this.formatItem(item);
  }

  async deleteSearchItem(userId: number, id: number): Promise<boolean> {
    return this.repository.deleteById(userId, id);
  }

  async clearHistory(userId: number): Promise<number> {
    return this.repository.clearAll(userId);
  }
}

export const searchHistoryService = new SearchHistoryService();
export default searchHistoryService;

