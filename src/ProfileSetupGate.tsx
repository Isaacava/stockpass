import { useEffect, useState } from 'react';
import { Check, UserRound, X } from 'lucide-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { ensureProfile } from './lib/stockpass';
import { loadProfile, saveProfile, type StockPassProfile } from './lib/social';
import StockPassAdditions from './StockPassAdditions';
import './profile-setup.css';

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
    {children}
    <StockPassAdditions />
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
