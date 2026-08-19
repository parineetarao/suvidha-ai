/**
 * Client binding for MY (Member 3) GET /csc/nearby endpoint. No auth
 * required, matching backend/app/api/v1/csc.py.
 */

import { apiGet } from "@/lib/api-client"

export interface CSCOut {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
  distance_km: number
}

export function getNearbyCscs(lat: number, lng: number, radiusKm = 25): Promise<CSCOut[]> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radiusKm) })
  return apiGet<CSCOut[]>(`/csc/nearby?${params.toString()}`)
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
    })
  })
}
