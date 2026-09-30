import { TenantLocation } from '../types/tenant';

// Empty-location default used until the tenant's primary site loads.
export const INITIAL_TENANT_LOCATION: TenantLocation = {
  id: '',
  tenantId: '',
  tenantName: '',
  name: 'No site configured',
  code: '—',
  status: 'INACTIVE',
  address: {
    line1: '—',
    line2: '',
    city: '—',
    province: '—',
    postalCode: '',
    country: '—'
  },
  timezone: 'UTC',
  latitude: 0,
  longitude: 0,
  phone: '—',
  email: '—',
  emergencyContact: '—',
  contactPerson: '—',
  capacity: 0,
  currentOccupancy: 0,
  createdAt: '',
  updatedAt: '',
  description: 'Create a site to activate this location.',
  operatingHours: {
    timezone: 'UTC',
    isOpen24_7: false,
    days: [
      { day: 'MONDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'TUESDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'WEDNESDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'THURSDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'FRIDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'SATURDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'SUNDAY', enabled: true, open: '00:00', close: '23:59' }
    ]
  }
};
