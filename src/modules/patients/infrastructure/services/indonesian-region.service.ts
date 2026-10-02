import { Injectable, Logger } from '@nestjs/common';

export interface RegionReferenceItem {
  id: string;
  name: string;
  label: string;
  value: string;
  provinceId?: string;
  regencyId?: string;
  districtId?: string;
}

interface RawProvince {
  id: string;
  name: string;
}

interface RawRegency {
  id: string;
  province_id: string;
  name: string;
}

interface RawDistrict {
  id: string;
  regency_id: string;
  name: string;
}

interface RawVillage {
  id: string;
  district_id: string;
  name: string;
}

function formatRegionName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .split(' ')
    .map((word) => {
      if (word === 'dki') return 'DKI';
      if (word === 'diy') return 'DIY';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

@Injectable()
export class IndonesianRegionService {
  private readonly logger = new Logger(IndonesianRegionService.name);
  private readonly baseUrl =
    'https://emsifa.github.io/api-wilayah-indonesia/api';

  // In-memory cache for fast, sub-millisecond repeated responses
  private provincesCache: RegionReferenceItem[] | null = null;
  private readonly regenciesCache = new Map<string, RegionReferenceItem[]>();
  private readonly districtsCache = new Map<string, RegionReferenceItem[]>();
  private readonly villagesCache = new Map<string, RegionReferenceItem[]>();

  async getProvinces(): Promise<RegionReferenceItem[]> {
    if (this.provincesCache && this.provincesCache.length > 0) {
      return this.provincesCache;
    }

    try {
      const res = await fetch(`${this.baseUrl}/provinces.json`, {
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const raw: RawProvince[] = await res.json();
      const mapped: RegionReferenceItem[] = raw.map((item) => {
        const formatted = formatRegionName(item.name);
        return {
          id: item.id,
          name: formatted,
          label: formatted,
          value: item.id,
        };
      });

      this.provincesCache = mapped;
      return mapped;
    } catch (error) {
      this.logger.error('Failed to fetch provinces from region API:', error);
      return this.provincesCache ?? [];
    }
  }

  async getRegencies(provinceId: string): Promise<RegionReferenceItem[]> {
    if (!provinceId) return [];

    const cached = this.regenciesCache.get(provinceId);
    if (cached) return cached;

    try {
      const res = await fetch(`${this.baseUrl}/regencies/${provinceId}.json`, {
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const raw: RawRegency[] = await res.json();
      const mapped: RegionReferenceItem[] = raw.map((item) => {
        const formatted = formatRegionName(item.name);
        return {
          id: item.id,
          name: formatted,
          label: formatted,
          value: item.id,
          provinceId: item.province_id,
        };
      });

      this.regenciesCache.set(provinceId, mapped);
      return mapped;
    } catch (error) {
      this.logger.error(
        `Failed to fetch regencies for province ${provinceId}:`,
        error,
      );
      return [];
    }
  }

  async getDistricts(regencyId: string): Promise<RegionReferenceItem[]> {
    if (!regencyId) return [];

    const cached = this.districtsCache.get(regencyId);
    if (cached) return cached;

    try {
      const res = await fetch(`${this.baseUrl}/districts/${regencyId}.json`, {
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const raw: RawDistrict[] = await res.json();
      const mapped: RegionReferenceItem[] = raw.map((item) => {
        const formatted = formatRegionName(item.name);
        return {
          id: item.id,
          name: formatted,
          label: formatted,
          value: item.id,
          regencyId: item.regency_id,
        };
      });

      this.districtsCache.set(regencyId, mapped);
      return mapped;
    } catch (error) {
      this.logger.error(
        `Failed to fetch districts for regency ${regencyId}:`,
        error,
      );
      return [];
    }
  }

  async getVillages(districtId: string): Promise<RegionReferenceItem[]> {
    if (!districtId) return [];

    const cached = this.villagesCache.get(districtId);
    if (cached) return cached;

    try {
      const res = await fetch(`${this.baseUrl}/villages/${districtId}.json`, {
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const raw: RawVillage[] = await res.json();
      const mapped: RegionReferenceItem[] = raw.map((item) => {
        const formatted = formatRegionName(item.name);
        return {
          id: item.id,
          name: formatted,
          label: formatted,
          value: item.id,
          districtId: item.district_id,
        };
      });

      this.villagesCache.set(districtId, mapped);
      return mapped;
    } catch (error) {
      this.logger.error(
        `Failed to fetch villages for district ${districtId}:`,
        error,
      );
      return [];
    }
  }
}
