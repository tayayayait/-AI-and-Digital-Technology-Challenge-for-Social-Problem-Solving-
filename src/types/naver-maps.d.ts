interface NaverMapsMapInstance {
  setCenter(position: NaverMapsLatLngInstance): void;
  setZoom(zoom: number): void;
  getCenter?(): NaverMapsLatLngInstance;
  getBounds?(): NaverMapsBoundsInstance;
  destroy?(): void;
}

interface NaverMapsLatLngInstance {
  readonly __naverLatLngBrand?: never;
  lat?: number | (() => number);
  lng?: number | (() => number);
}

interface NaverMapsBoundsInstance {
  getSW(): NaverMapsLatLngInstance;
  getNE(): NaverMapsLatLngInstance;
}

interface NaverMapsMarkerInstance {
  setMap(map: NaverMapsMapInstance | null): void;
  setZIndex?(zIndex: number): void;
}

interface NaverMapsPolylineInstance {
  setMap(map: NaverMapsMapInstance | null): void;
}

interface NaverMapsPolygonInstance {
  setMap(map: NaverMapsMapInstance | null): void;
}

interface NaverMapsGroundOverlayInstance {
  setMap(map: NaverMapsMapInstance | null): void;
}

interface NaverMapsInfoWindowInstance {
  open(map: NaverMapsMapInstance, marker: NaverMapsMarkerInstance): void;
  close(): void;
}

interface NaverMapsEventListener {
  remove?(): void;
}

interface NaverMapsNamespace {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMapsMapInstance;
    LatLng: new (lat: number, lng: number) => NaverMapsLatLngInstance;
    Marker: new (options: Record<string, unknown>) => NaverMapsMarkerInstance;
    Polyline: new (options: Record<string, unknown>) => NaverMapsPolylineInstance;
    Polygon: new (options: Record<string, unknown>) => NaverMapsPolygonInstance;
    GroundOverlay?: new (
      url: string,
      bounds: NaverMapsBoundsInstance,
      options?: Record<string, unknown>,
    ) => NaverMapsGroundOverlayInstance;
    InfoWindow: new (options: Record<string, unknown>) => NaverMapsInfoWindowInstance;
    Size: new (width: number, height: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    Event: {
      addListener(
        target: unknown,
        eventName: string,
        listener: (...args: unknown[]) => void,
      ): NaverMapsEventListener;
      removeListener(listener: NaverMapsEventListener): void;
    };
    Service?: {
      Status?: {
        OK?: string;
      };
      geocode(
        options: { query: string },
        callback: (status: string, response: NaverMapsGeocodeResponse) => void,
      ): void;
      reverseGeocode?(
        options: { coords: NaverMapsLatLngInstance },
        callback: (status: string, response: NaverMapsReverseGeocodeResponse) => void,
      ): void;
    };
  };
}

interface Window {
  naver?: NaverMapsNamespace;
}

interface NaverMapsGeocodeResponse {
  v2?: {
    addresses?: Array<{
      roadAddress?: string;
      jibunAddress?: string;
      englishAddress?: string;
      x?: string;
      y?: string;
    }>;
  };
}

interface NaverMapsReverseGeocodeResponse {
  v2?: {
    address?: {
      roadAddress?: string;
      jibunAddress?: string;
      englishAddress?: string;
    };
  };
}
