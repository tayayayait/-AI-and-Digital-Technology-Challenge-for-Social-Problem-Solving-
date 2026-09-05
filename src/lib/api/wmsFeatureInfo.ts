import { supabase } from "@/integrations/supabase/client";
import { measureApiHealth } from "@/lib/api/measureApiHealth";
import type { ApiResult } from "@/lib/api/types";
import type { LatLng } from "@/lib/types";
import type { WmsBounds } from "@/lib/map/wms";
import { API_HEALTH_SOURCE_NAMES } from "@/store/apiHealth";

interface WmsFeatureInfoResult {
  overlap: number;
  features: unknown[];
  failed?: boolean;
}

export async function fetchWmsGetFeatureInfo(params: {
  endpoint: string;
  layer: string;
  bounds: WmsBounds;
  point: LatLng;
}): Promise<WmsFeatureInfoResult> {
  try {
    const measured = await measureApiHealth({
      name: API_HEALTH_SOURCE_NAMES.safeMapWms,
      source: "SafeMap WMS",
      run: async (): Promise<ApiResult<WmsFeatureInfoResult>> => {
        const { data, error } = await supabase.functions.invoke<{
          overlap: number;
          features: unknown[];
        }>("safemap-feature-info", {
          body: {
            endpoint: params.endpoint,
            layer: params.layer,
            bounds: params.bounds,
            point: params.point,
          },
        });

        if (error) {
          console.error(
            `WMS GetFeatureInfo proxy failed for layer ${params.layer}:`,
            error.message,
          );
          return {
            data: { overlap: 0, features: [], failed: true },
            status: "FAILED",
            timestamp: new Date().toISOString(),
            source: "SafeMap WMS",
            error: error.message,
          };
        }

        return {
          data: {
            overlap: typeof data?.overlap === "number" ? data.overlap : 0,
            features: Array.isArray(data?.features) ? data.features : [],
          },
          status: "OK",
          timestamp: new Date().toISOString(),
          source: "SafeMap WMS",
        };
      },
    });

    return measured.data ?? { overlap: 0, features: [], failed: true };
  } catch (error) {
    console.error(`WMS GetFeatureInfo exception for layer ${params.layer}:`, error);
    return { overlap: 0, features: [], failed: true as const };
  }
}
