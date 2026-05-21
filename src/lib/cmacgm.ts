/**
 * CMA CGM SpotOn API client
 * OAuth2 client credentials flow + spot search + quotation creation
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const tokenUrl = process.env.CMACGM_TOKEN_URL || "https://auth.cma-cgm.com/as/token.oauth2";
  const clientId = process.env.CMACGM_CLIENT_ID;
  const clientSecret = process.env.CMACGM_CLIENT_SECRET;
  const scope = process.env.CMACGM_SCOPE || "instantquote:read:be";

  if (!clientId || !clientSecret) {
    throw new Error("CMACGM_CLIENT_ID and CMACGM_CLIENT_SECRET are required");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth2 token error (${res.status}): ${text}`);
  }

  const data: any = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

const BASE_URL = process.env.CMACGM_BASE_URL || "https://apis.cma-cgm.net/pricing/commercial/instantquote/v2";

export interface SpotSearchParams {
  pol: string;
  pod: string;
  date?: string;
  commodity?: string;
  equipments?: { iso: string; count: number; weight: number }[];
}

export async function searchSpotRates(params: SpotSearchParams): Promise<any> {
  const token = await getAccessToken();

  const requestedEquipments = params.equipments && params.equipments.length > 0
    ? params.equipments.map(e => ({
        equipmentGroupIsoCode: e.iso,
        numberOfContainers: e.count,
        weightPerContainer: e.weight,
      }))
    : [
        { equipmentGroupIsoCode: "20GP", numberOfContainers: 1, weightPerContainer: 10000 },
        { equipmentGroupIsoCode: "40GP", numberOfContainers: 1, weightPerContainer: 10000 },
        { equipmentGroupIsoCode: "40HC", numberOfContainers: 1, weightPerContainer: 10000 },
      ];

  const body: any = {
    portOfLoading: params.pol,
    portOfDischarge: params.pod,
    locationCodificationType: "CMACGM",
    commodityCode: params.commodity || "FAK",
    spotDDSMConditionsOnly: true,
    requestedEquipments,
  };

  if (params.date) {
    body.departureDate = params.date;
  }

  const res = await fetch(`${BASE_URL}/spotOn/search`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SpotOn search error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data;
}

export async function createQuotation(offerId: string, vas?: { vasCode: string; subscription: boolean }[]): Promise<any> {
  const token = await getAccessToken();

  const body: any = {};
  if (vas && vas.length > 0) {
    body.vas = vas;
  }

  const res = await fetch(`${BASE_URL}/offers/${encodeURIComponent(offerId)}/quotations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Quotation creation error (${res.status}): ${text}`);
  }

  return await res.json();
}
