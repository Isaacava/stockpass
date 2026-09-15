import { Activity, Bell, Home, UserRound, WalletCards } from 'lucide-react';
import { useAppKitAccount } from '@reown/appkit/react';

function clickNav(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.nav-link')).find((node) => node.textContent?.trim().startsWith(label));
  button?.click();
}

export default function MobileSocialBar() {
  const { address } = useAppKitAccount();

  const openProfile = () => {
    document.querySelector<HTMLButtonElement>('.wallet-mini')?.click();
  };

  if (new URLSearchParams(window.location.search).has('profile')) return null;

  return <nav className="sp-mobile-social-bar" aria-label="Mobile StockPass navigation">
    <button onClick={() => clickNav('Discover')} aria-label="Discover"><Home size={20} /><span>Home</span></button>
    <button onClick={() => clickNav('Portfolio')} aria-label="Portfolio"><WalletCards size={20} /><span>Portfolio</span></button>
    <button onClick={() => clickNav('Alerts')} aria-label="Alerts"><Bell size={20} /><span>Alerts</span></button>
    <button onClick={() => clickNav('Activity')} aria-label="Activity"><Activity size={20} /><span>Activity</span></button>
    {address && <button onClick={openProfile} aria-label="Profile"><UserRound size={20} /><span>Profile</span></button>}
  </nav>;
}
