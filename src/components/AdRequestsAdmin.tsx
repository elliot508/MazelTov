import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { AdRequest } from '@/lib/types';
import { ChevronLeft, Check, X, Clock, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  onBack: () => void;
}

export function AdRequestsAdmin({ onBack }: Props) {
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin ?? false;
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async () => {
    let query = supabase
      .from('ad_requests')
      .select('id, user_id, business_name, contact_email, caption, image_path, duration_days, price_cents, status, admin_note, created_at, reviewed_at')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data } = await query;
    setRequests((data as AdRequest[]) ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function approve(reqId: string) {
    setActionBusy(reqId);
    try {
      const note = adminNote[reqId] ?? '';
      const { error } = await supabase.rpc('approve_ad_request', {
        p_request_id: reqId,
        p_admin_note: note,
      });
      if (error) throw error;
      await loadRequests();
    } catch (err) {
      const msg = (err && typeof err === 'object' && 'message' in err && String((err as { message: unknown }).message)) || 'Approve failed';
      alert(msg);
    } finally {
      setActionBusy(null);
    }
  }

  async function reject(reqId: string) {
    setActionBusy(reqId);
    try {
      const note = adminNote[reqId] ?? '';
      const { error } = await supabase.rpc('reject_ad_request', {
        p_request_id: reqId,
        p_admin_note: note,
      });
      if (error) throw error;
      await loadRequests();
    } catch (err) {
      const msg = (err && typeof err === 'object' && 'message' in err && String((err as { message: unknown }).message)) || 'Reject failed';
      alert(msg);
    } finally {
      setActionBusy(null);
    }
  }

  function imageUrl(path: string): string {
    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ads/${path}`;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Admin access required.</p>
      </div>
    );
  }

  const tabs: { key: typeof filter; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-2xl mx-auto relative flex items-center h-14 px-2">
          <button onClick={onBack} className="flex items-center text-[#007AFF] active:opacity-60 transition-opacity px-2">
            <ChevronLeft size={26} />
            <span className="text-[17px] -ml-1">Back</span>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2">
            <span className="font-semibold text-gray-900 text-[17px]">Ad Requests</span>
          </div>
        </div>
      </div>

      <div className="pt-20 pb-12 max-w-2xl mx-auto px-4">
        {/* Filter tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setFilter(tab.key); setLoading(true); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                filter === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading requests…</div>
        ) : requests.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-gray-400 text-[15px]">No {filter !== 'all' ? filter : ''} requests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="rounded-3xl bg-white shadow-sm overflow-hidden">
                {/* Image */}
                <div className="relative w-full aspect-[4/2] bg-gray-100">
                  <img src={imageUrl(req.image_path)} alt={req.business_name} className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {req.status === 'pending' && (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center gap-1">
                        <Clock size={11} /> PENDING
                      </span>
                    )}
                    {req.status === 'approved' && (
                      <span className="px-2.5 py-1 rounded-full bg-green-500 text-white text-[11px] font-bold flex items-center gap-1">
                        <CheckCircle2 size={11} /> APPROVED
                      </span>
                    )}
                    {req.status === 'rejected' && (
                      <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center gap-1">
                        <XCircle size={11} /> REJECTED
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-[17px] font-bold text-gray-900">{req.business_name}</h3>
                      <p className="text-[13px] text-gray-500">{req.contact_email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#007AFF]">${(req.price_cents / 100).toFixed(0)}</p>
                      <p className="text-[12px] text-gray-400">{req.duration_days} day{req.duration_days !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  {req.caption && (
                    <p className="text-[14px] text-gray-600 bg-gray-50 rounded-xl p-2.5">{req.caption}</p>
                  )}

                  <div className="flex items-center gap-3 text-[12px] text-gray-400">
                    <span>Submitted {new Date(req.created_at).toLocaleDateString()}</span>
                    {req.reviewed_at && <span>Reviewed {new Date(req.reviewed_at).toLocaleDateString()}</span>}
                  </div>

                  {req.admin_note && req.status !== 'pending' && (
                    <p className="text-[13px] text-gray-500 italic bg-gray-50 rounded-xl p-2.5">
                      Admin note: {req.admin_note}
                    </p>
                  )}

                  {/* Admin actions */}
                  {req.status === 'pending' && (
                    <div className="space-y-2 pt-1">
                      <input
                        type="text"
                        placeholder="Optional admin note..."
                        value={adminNote[req.id] ?? ''}
                        onChange={(e) => setAdminNote({ ...adminNote, [req.id]: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[14px] text-gray-700 focus:outline-none focus:border-[#007AFF] transition-colors"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => approve(req.id)}
                          disabled={actionBusy === req.id}
                          className="flex-1 py-2.5 rounded-xl bg-green-500 text-white font-semibold text-[14px] flex items-center justify-center gap-1.5 hover:bg-green-600 transition-colors disabled:opacity-50"
                        >
                          <Check size={16} /> {actionBusy === req.id ? 'Processing…' : 'Approve & Go Live'}
                        </button>
                        <button
                          onClick={() => reject(req.id)}
                          disabled={actionBusy === req.id}
                          className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 font-semibold text-[14px] flex items-center justify-center gap-1.5 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          <X size={16} /> Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
