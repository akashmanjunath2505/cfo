export const getOwnerHeaders = () => {
  const ownerToken = (import.meta.env.VITE_OWNER_TOKEN || localStorage.getItem('owner_token') || '').trim();
  return {
    'x-owner-role': 'owner',
    ...(ownerToken ? { 'x-owner-token': ownerToken } : {})
  };
};

export const apiFetch = async (url: string, init?: RequestInit) => {
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...getOwnerHeaders()
    }
  });
};
