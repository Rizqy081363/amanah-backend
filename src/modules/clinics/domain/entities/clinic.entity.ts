export class PoliklinikEntity {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  isActive: boolean;
  createdAt: Date;
}

export class LayananPoliEntity {
  id: string;
  poliklinikId: string;
  name: string;
  description?: string | null;
  medicalFlow: 'pregnancy' | 'immunization' | 'general';
  isActive: boolean;
  createdAt: Date;
}
