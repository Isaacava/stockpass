import { useEffect, useState } from 'react';
import { Check, UserRound, X } from 'lucide-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { ensureProfile } from './lib/stockpass';
import { loadProfile, saveProfile, type StockPassProfile } from './lib/social';
import StockPassAdditions from './StockPassAdditions';
import ProfileHoldingBadges from './ProfileHoldingBadges';
import MobileSocialBar from './MobileSocialBar';
import StockPassUtilityHub from './StockPassUtilityHub';
import './profile-setup.css';
import './mobile-social.css';

const discoverUtilityCss = `
.hero + .content-section{border-top:1px solid var(--sp-line)}
.hero + .content-section .section-heading{background:#fff}
.hero + .content-section .feed-grid{display:flex!important;flex-direction:column!important;gap:0!important}
.hero + .content-section .sidebar-card{order:-1!important;margin:0!important;border:0!important;border-bottom:1px solid var(--sp-line)!important;border-radius:0!important;background:#fbfcfe!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:0!important;padding:0!important;overflow:hidden}
.hero + .content-section .sidebar-card .side-title{grid-column:1/-1;padding:18px 18px 10px!important;border-bottom:1px solid #edf1f5!important;background:#fff!important}
.hero + .content-section .sidebar-card .side-title:after{content:'Official xStocks prices · live market source';display:block;margin-top:5px;color:#8a97a6;font-size:7px;font-weight:500}
.hero + .content-section .sidebar-card .trend-row{min-height:106px;padding:14px 13px!important;border-right:1px solid #edf1f5;border-bottom:1px solid #edf1f5;display:grid!important;grid-template-columns:auto 1fr!important;grid-template-rows:auto auto!important;gap:7px 8px!important;background:#fbfcfe!important}
.hero + .content-section .sidebar-card .trend-row:nth-of-type(3n+1){border-right:0}
.hero + .content-section .sidebar-card .trend-row .ticker-dot{grid-row:1/3;width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:#101827;color:#fff;font:800 7px/1 'DM Mono',monospace}
.hero + .content-section .sidebar-card .trend-row>div:nth-child(2){min-width:0}
.hero + .content-section .sidebar-card .trend-row strong{display:block;font-size:11px!important;letter-spacing:-.02em}
.hero + .content-section .sidebar-card .trend-row small{display:block;margin-top:3px;font-size:7px!important;color:#7b8794!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero + .content-section .sidebar-card .trend-price{grid-column:2;display:flex!important;align-items:baseline;justify-content:space-between;gap:6px;width:auto!important;margin:0!important}
.hero + .content-section .sidebar-card .trend-price b{font:800 13px/1 'DM Mono',monospace;color:#101827}
.hero + .content-section .sidebar-card .trend-price span{font:700 6px/1 'DM Mono',monospace;color:#19885a}
.hero + .content-section .feed-column{order:2}
.hero + .content-section .feed-column:before{content:'VERIFIED ACTIVITY';display:block;padding:18px 18px 10px;border-bottom:1px solid var(--sp-line);font:700 8px/1 'DM Mono',monospace;letter-spacing:.12em;color:#6d7a89}
@media(max-width:720px){
  .hero + .content-section .sidebar-card{grid-template-columns:1fr 1fr}
  .hero + .content-section .sidebar-card .trend-row:nth-of-type(3n+1){border-right:1px solid #edf1f5}
  .hero + .content-section .sidebar-card .trend-row:nth-of-type(2n+1){border-right:0}
}
@media(max-width:480px){
  .hero + .content-section .sidebar-card{grid-template-columns:1fr}
  .hero + .content-section .sidebar-card .trend-row{border-right:0!important}
}
`;

export default function ProfileSetupGate({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAppKitAccount();
  const [profile, setProfile] = useState<StockPassProfile | null>(null);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!address || !isConnected) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await ensureProfile(address);
        const current = await loadProfile(address);
        if (cancelled) return;
        setProfile(current);
        setName(current?.display_name ?? '');
        setHandle(current?.handle ?? '');
      } catch {
        if (!cancelled) setError('Could not load your StockPass profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address, isConnected]);

  const needsSetup = Boolean(isConnected && address && !loading && (!profile || !profile.handle || !profile.display_name) && !closed);

  const save = async () => {
    if (!address) return;
    const cleanHandle = handle.trim().replace(/^@/, '').toLowerCase();
    const cleanName = name.trim();
    if (!cleanName) return setError('Add your first name or first and last name.');
    if (!/^[a-z0-9_]{5,15}$/.test(cleanHandle)) return setError('Username must be 5–15 characters using letters, numbers, or _.');
    setSaving(true);
    setError('');
    try {
      const next = await saveProfile({ wallet: address, display_name: cleanName, handle: cleanHandle });
      setProfile(next);
      setClosed(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique') ? 'That username is already taken.' : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <style>{discoverUtilityCss}</style>
    {children}
    <ProfileHoldingBadges />
    <StockPassAdditions />
    <StockPassUtilityHub />
    <MobileSocialBar />
    {needsSetup && (
      <div className="sp-profile-backdrop">
        <div className="sp-profile-modal" role="dialog" aria-modal="true" aria-labelledby="sp-profile-title">
          <button className="sp-profile-close" onClick={() => setClosed(true)} aria-label="Close"><X size={15} /></button>
          <div className="sp-profile-icon"><UserRound size={20} /></div>
          <span className="sp-profile-eyebrow">WELCOME TO STOCKPASS</span>
          <h2 id="sp-profile-title">Choose how people will see you.</h2>
          <p>Your wallet proves the account. Your name and username give the social layer a real identity.</p>
          <label>First name or full name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="Isaac Mark" autoComplete="name" /></label>
          <label>Username<input value={handle} onChange={(e) => setHandle(e.target.value.replace(/\s/g, ''))} maxLength={15} placeholder="isaacmark" autoComplete="username" /><span className="sp-handle-hint">@{handle || 'yourusername'} · 5–15 characters</span></label>
          {error && <div className="sp-profile-error">{error}</div>}
          <button className="sp-profile-save" onClick={() => void save()} disabled={saving}><Check size={15} /> {saving ? 'Saving…' : 'Save profile'}</button>
          <div className="sp-profile-note">You can change these later from your profile.</div>
        </div>
      </div>
    )}
  </>;
}
