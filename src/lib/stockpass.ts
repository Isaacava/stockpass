import { supabase } from './supabase';
import type { StockAsset } from './assets';
import type { VerifiedPosition } from './solana';
import { fanoutPostNotification } from './social';

export async function ensureProfile(wallet: string) {
  const { error } = await supabase.from('stockpass_profiles').upsert({ wallet, updated_at: new Date().toISOString() }, { onConflict: 'wallet' });
  if (error) throw error;
}

export async function ensureAsset(asset: StockAsset) {
  if (!asset.mint) throw new Error(`No official mint configured for ${asset.symbol}`);
  const { error } = await supabase.from('stockpass_assets').upsert({ mint: asset.mint, symbol: asset.symbol, name: asset.name, icon: asset.icon, source: asset.source }, { onConflict: 'mint' });
  if (error) throw error;
}

export async function saveVerificationSnapshot(wallet: string, position: VerifiedPosition, slot: number) {
  await ensureProfile(wallet);
  await ensureAsset(position);
  const { data, error } = await supabase.from('stockpass_verification_snapshots').insert({ wallet, mint: position.mint, balance: position.balance, slot, observed_at: new Date().toISOString() }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export type FeedPost = { id: string; wallet: string; mint: string | null; body: string; proof_type: string; created_at: string };

export async function publishVerifiedPost(input: { wallet: string; position: VerifiedPosition; slot: number; body: string }) {
  const snapshotId = await saveVerificationSnapshot(input.wallet, input.position, input.slot);
  const { data, error } = await supabase.from('stockpass_posts').insert({ wallet: input.wallet, mint: input.position.mint, body: input.body.trim().slice(0, 500), proof_type: 'verified_holder', verification_snapshot_id: snapshotId }).select('id, wallet, mint, body, proof_type, created_at').single();
  if (error) throw error;
  await supabase.from('stockpass_activity_events').insert({ wallet: input.wallet, mint: input.position.mint, event_type: 'post_created', metadata: { proof_type: 'verified_holder', verification_snapshot_id: snapshotId }, transaction_signature: null });
  await fanoutPostNotification(data as FeedPost);
  return data;
}

export async function loadPosts(limit = 30): Promise<FeedPost[]> {
  const { data, error } = await supabase.from('stockpass_posts').select('id, wallet, mint, body, proof_type, created_at').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

export async function createPriceAlert(input: { wallet: string; mint: string | null; direction: 'above' | 'below'; target_price: number }) {
  const { error } = await supabase.from('stockpass_alerts').insert({ wallet: input.wallet, mint: input.mint, direction: input.direction, target_price: input.target_price, channel: 'in_app', active: true });
  if (error) throw error;
}

export async function loadAlerts(wallet: string) {
  const { data, error } = await supabase.from('stockpass_alerts').select('id, mint, direction, target_price, active').eq('wallet', wallet).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
