import { type Request, type Response, type NextFunction } from 'express';
import searchHistoryService, { SearchHistoryService } from './search-history.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class SearchHistoryController {
  constructor(private readonly service: SearchHistoryService = searchHistoryService) {}

  getRecentSearches = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }

      const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 5;
      const limit = isNaN(rawLimit) || rawLimit <= 0 ? 5 : rawLimit;
      const recent = await this.service.getRecentSearches(req.user.id, limit);
      sendSuccess(res, 'Recent searches retrieved successfully', recent, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch recent searches', 400);
    }
  };

  createSearch = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }

      const item = await this.service.saveSearch(req.user.id, req.body);
      sendSuccess(res, 'Search saved to history successfully', item, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to save search history', 400);
    }
  };

  deleteSearchItem = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }

      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        sendError(res, 'Invalid search history ID', 400);
        return;
      }

      const deleted = await this.service.deleteSearchItem(req.user.id, id);
      if (!deleted) {
        sendError(res, 'Search history item not found or already deleted', 404);
        return;
      }

      sendSuccess(res, 'Search history item deleted successfully', { id }, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete search history item', 400);
    }
  };

  clearHistory = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }

      const count = await this.service.clearHistory(req.user.id);
      sendSuccess(res, 'Search history cleared successfully', { deletedCount: count }, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to clear search history', 400);
    }
  };
}

export const searchHistoryController = new SearchHistoryController();
export default searchHistoryController;

