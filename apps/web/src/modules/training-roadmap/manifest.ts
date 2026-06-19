import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { Route } from 'lucide-react';

export const trainingRoadmapNavManifest: NavManifest = {
  id: 'training-roadmap',
  label: 'Training Roadmap',
  icon: Route,
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Training',
      items: [
        {
          id: 'training-roadmap.home',
          icon: Route,
          label: 'Roadmap',
          to: '/training-roadmap',
        },
      ],
    },
  ],
};
