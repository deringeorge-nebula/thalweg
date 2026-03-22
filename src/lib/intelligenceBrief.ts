// src/lib/intelligenceBrief.ts
// Calls the intelligence-brief Edge Function and returns the formatted brief.

export interface BriefResult {
    brief: string;
    tokens_used: number;
    model: string;
}

export async function generateVesselBrief(mmsi: string): Promise<BriefResult> {
    const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/intelligence-brief`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ mmsi }),
        }
    );

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Brief generation failed: ${err}`);
    }

    const data = await res.json();
    if (data.status === "error") throw new Error(data.message);
    return data as BriefResult;
}

export async function generatePortBrief(portId: string): Promise<BriefResult> {
    const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/intelligence-brief`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ port_id: portId }),
        }
    );

    if (!res.ok) throw new Error(`Port brief failed: ${await res.text()}`);
    const data = await res.json();
    if (data.status === "error") throw new Error(data.message);
    return data as BriefResult;
}
