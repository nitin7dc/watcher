import type { Routes } from '@angular/router';
import { Overview } from './pages/overview';

export const routes: Routes = [
  { path: '', component: Overview, title: 'Watcher' },
  { path: 'assets', loadComponent: () => import('./pages/assets').then((m) => m.Assets), title: 'Assets | Watcher' },
  { path: 'wallets', loadComponent: () => import('./pages/wallets').then((m) => m.Wallets), title: 'Wallets | Watcher' },
  {
    path: 'wallets/:id',
    loadComponent: () => import('./pages/wallet-detail').then((m) => m.WalletDetail),
    title: 'Wallet | Watcher',
  },
  { path: 'tokens', loadComponent: () => import('./pages/tokens').then((m) => m.Tokens), title: 'Tokens | Watcher' },
  { path: 'networks', loadComponent: () => import('./pages/networks').then((m) => m.Networks), title: 'Networks | Watcher' },
  { path: 'settings', loadComponent: () => import('./pages/settings').then((m) => m.SettingsPage), title: 'Settings | Watcher' },
  { path: '**', redirectTo: '' },
];
