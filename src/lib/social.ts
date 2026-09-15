import { supabase } from './supabase';
import type { FeedPost } from './stockpass';

export type StockPassProfile = {
  wallet: string;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type StockPassNotification = {
  id: string;
  actor_wallet: string | null;
  event_type: string;
  post_id: string | null;
  asset_mint: string | null;
  message: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export async function loadProfile(wallet: string) {
  const { data, error } = await supabase.from('stockpass_profiles').select('wallet, handle, display_name, bio, avatar_url, created_at, updated_at').eq('wallet', wallet).maybeSingle();
  if (error) throw error;
  return (data ?? null) as StockPassProfile | null;
}

export async function saveProfile(input: Pick<StockPassProfile, 'wallet'> & Partial<Omit<StockPassProfile, 'wallet' | 'created_at' | 'updated_at'>>) {
  const { data, error } = await supabase.from('stockpass_profiles').upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'wallet' }).select('wallet, handle, display_name, bio, avatar_url, created_at, updated_at').single();
  if (error) throw error;
  return data as StockPassProfile;
}

export async function loadFollowCounts(wallet: string) {
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase.from('stockpass_follows').select('*', { count: 'exact', head: true }).eq('followed_wallet', wallet),
    supabase.from('stockpass_follows').select('*', { count: 'exact', head: true }).eq('follower_wallet', wallet)
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}

export async function isFollowing(followerWallet: string, followedWallet: string) {
  const { data, error } = await supabase.from('stockpass_follows').select('follower_wallet').eq('follower_wallet', followerWallet).eq('followed_wallet', followedWallet).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function followWallet(followerWallet: string, followedWallet: string) {
  if (followerWallet === followedWallet) throw new Error('You cannot follow your own wallet.');
  const { error } = await supabase.from('stockpass_follows').upsert({ follower_wallet: followerWallet, followed_wallet: followedWallet }, { onConflict: 'follower_wallet,followed_wallet', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unfollowWallet(followerWallet: string, followedWallet: string) {
  const { error } = await supabase.from('stockpass_follows').delete().eq('follower_wallet', followerWallet).eq('followed_wallet', followedWallet);
  if (error) throw error;
}

export async function loadNotifications(wallet: string) {
  const { data, error } = await supabase.from('stockpass_notifications').select('id, actor_wallet, event_type, post_id, asset_mint, message, read_at, created_at').eq('recipient_wallet', wallet).order('created_at', { ascending: false }).limit(40);
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, title: String(row.event_type || 'StockPass update').replace(/_/g, ' '), body: String(row.message || '') })) as StockPassNotification[];
}

export async function markNotificationsRead(wallet: string) {
  const { error } = await supabase.from('stockpass_notifications').update({ read_at: new Date().toISOString() }).eq('recipient_wallet', wallet).is('read_at', null);
  if (error) throw error;
}

export async function fanoutPostNotification(post: FeedPost) {
  const { data: followers, error } = await supabase.from('stockpass_follows').select('follower_wallet').eq('followed_wallet', post.wallet);
  if (error) throw error;
  if (!followers?.length) return;
  const message = `${shortWallet(post.wallet)} published a verified StockPass position.`;
  const rows = followers.map((row) => row.follower_wallet).filter((wallet): wallet is string => Boolean(wallet) && wallet !== post.wallet).map((recipient_wallet) => ({ recipient_wallet, actor_wallet: post.wallet, event_type: 'verified_post', post_id: post.id, asset_mint: post.mint, message }));
  if (!rows.length) return;
  const { error: notificationError } = await supabase.from('stockpass_notifications').insert(rows);
  if (notificationError) throw notificationError;
}

export async function loadRecentPostsByWallet(wallet: string, limit = 12) {
  const { data, error } = await supabase.from('stockpass_posts').select('id, wallet, mint, body, proof_type, created_at').eq('wallet', wallet).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as FeedPost[];
}

export async function searchProfiles(query: string, limit = 10) {
  const needle = query.trim();
  if (!needle) return [] as StockPassProfile[];
  const { data, error } = await supabase.from('stockpass_profiles').select('wallet, handle, display_name, bio, avatar_url, created_at, updated_at').or(`handle.ilike.%${needle}%,display_name.ilike.%${needle}%,wallet.ilike.%${needle}%`).limit(limit);
  if (error) throw error;
  return (data ?? []) as StockPassProfile[];
}

export function shortWallet(wallet?: string | null) {
  if (!wallet) return 'Unknown wallet';
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export function profileUrl(wallet: string) {
  return `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(wallet)}`;
}
