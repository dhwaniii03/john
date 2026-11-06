import hazardRepository, { HazardRepository } from './hazard.repository.js';
import type {
  Hazard,
  HazardCategory,
  CreateHazardCategoryDTO,
  UpdateHazardCategoryDTO,
  CreateHazardDTO,
  UpdateHazardDTO,
  HazardFilterOptions,
  NearbyHazardOptions,
  HazardReport,
  CreateHazardReportDTO,
  ReportFilterOptions,
} from './hazard.types.js';
import { getPaginationMeta } from '../../utils/pagination.js';

export class HazardService {
  constructor(private readonly repo: HazardRepository = hazardRepository) {}

  // --- Categories ---
  async getCategories(onlyActive = true): Promise<HazardCategory[]> {
    return this.repo.getCategories(onlyActive);
  }

  async getCategoryById(id: number): Promise<HazardCategory> {
    const category = await this.repo.findCategoryById(id);
    if (!category) {
      throw new Error('Hazard category not found');
    }
    return category;
  }

  async createCategory(data: CreateHazardCategoryDTO): Promise<HazardCategory> {
    const existing = await this.repo.findCategoryByName(data.name);
    if (existing) {
      throw new Error(`Category with name "${data.name}" already exists`);
    }
    return this.repo.createCategory(data);
  }

  async updateCategory(id: number, data: UpdateHazardCategoryDTO): Promise<HazardCategory> {
    const existing = await this.repo.findCategoryById(id);
    if (!existing) {
      throw new Error('Hazard category not found');
    }
    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await this.repo.findCategoryByName(data.name);
      if (duplicate && duplicate.id !== id) {
        throw new Error(`Category with name "${data.name}" already exists`);
      }
    }
    const updated = await this.repo.updateCategory(id, data);
    if (!updated) {
      throw new Error('Failed to update category');
    }
    return updated;
  }

  async deleteCategory(id: number): Promise<void> {
    const existing = await this.repo.findCategoryById(id);
    if (!existing) {
      throw new Error('Hazard category not found');
    }
    const deleted = await this.repo.deleteCategory(id);
    if (!deleted) {
      throw new Error('Failed to delete hazard category');
    }
  }

  // --- Hazards ---
  async getHazards(options: HazardFilterOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));

    const { hazards, total } = await this.repo.findAll({ ...options, page, limit });
    const pagination = getPaginationMeta(total, page, limit);

    return { hazards, pagination };
  }

  async getHazardById(id: string | number): Promise<Hazard> {
    const hazard = await this.repo.findById(id);
    if (!hazard) {
      throw new Error('Hazard not found');
    }
    return hazard;
  }

  async getNearbyHazards(options: NearbyHazardOptions): Promise<Hazard[]> {
    return this.repo.findNearby(options);
  }

  private async processHazardImage(imageUrl?: string): Promise<string | undefined> {
    if (!imageUrl || typeof imageUrl !== 'string') return imageUrl;
    if (imageUrl.startsWith('data:image/') || imageUrl.length > 500) {
      try {
        const uploadServiceModule = await import('../uploads/upload.service.js');
        return uploadServiceModule.default.saveBase64Image(imageUrl, 'hazards');
      } catch (err) {
        console.warn('Failed to save base64 hazard image:', err);
        return imageUrl;
      }
    }
    return imageUrl;
  }

  async createHazard(data: CreateHazardDTO): Promise<Hazard> {
    const payload = { ...data };
    payload.image_url = await this.processHazardImage(payload.image_url);
    return this.repo.create(payload);
  }

  async updateHazard(id: string | number, data: UpdateHazardDTO): Promise<Hazard> {
    const payload = { ...data };
    if (payload.image_url) {
      payload.image_url = await this.processHazardImage(payload.image_url);
    }
    const hazard = await this.repo.update(id, payload);
    if (!hazard) {
      throw new Error('Hazard not found or update failed');
    }
    return hazard;
  }

  async updateHazardStatus(id: string | number, status: string): Promise<Hazard> {
    const hazard = await this.repo.updateStatus(id, status);
    if (!hazard) {
      throw new Error('Hazard not found or status update failed');
    }
    return hazard;
  }

  async deleteHazard(id: string | number): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) {
      throw new Error('Hazard not found or already deleted');
    }
  }

  // --- User Hazard Reporting & Admin Moderation ---
  async createReport(userId: number, data: CreateHazardReportDTO): Promise<HazardReport> {
    const payload = { ...data };
    payload.image_url = await this.processHazardImage(payload.image_url);
    return this.repo.createReport(userId, payload);
  }

  async getReportById(id: string | number, userId?: number, isAdmin = false): Promise<HazardReport> {
    const report = await this.repo.findReportById(id);
    if (!report) {
      throw new Error('Hazard report not found');
    }
    if (!isAdmin && userId && Number(report.user_id) !== Number(userId)) {
      throw new Error('Forbidden: You can only view your own hazard reports');
    }
    return report;
  }

  async getReports(options: ReportFilterOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));

    const { reports, total } = await this.repo.findReports({ ...options, page, limit });
    const pagination = getPaginationMeta(total, page, limit);

    return { reports, pagination };
  }

  async approveReport(
    reportId: number,
    adminId: number,
    hazardOptions?: { severity?: string; title?: string; category_id?: number }
  ): Promise<{ report: HazardReport; hazard: Hazard }> {
    return this.repo.approveReport(reportId, adminId, hazardOptions);
  }

  async rejectReport(reportId: number, adminId: number, rejectionReason: string): Promise<HazardReport> {
    return this.repo.rejectReport(reportId, adminId, rejectionReason);
  }

  // --- Hazard Confirmation & Resolution ---
  async confirmHazard(hazardId: string | number, userId?: number): Promise<Hazard> {
    return this.repo.confirmHazard(hazardId, userId);
  }

  async resolveHazard(
    hazardId: string | number,
    userId?: number,
    isAdmin = false,
    resolveThreshold = 3
  ): Promise<Hazard> {
    return this.repo.resolveHazard(hazardId, userId, isAdmin, resolveThreshold);
  }
}

export default new HazardService();
