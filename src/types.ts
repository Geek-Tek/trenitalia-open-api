/**
 * Returns some infos about a specific station
 * 
 * Usually city = 'A' means Trenitalia didn't save that station's city name (if so, I suggest using the station.name instead)
 * 
 * regionId = 0 usually appens in getAllStations(), if interested in a specific regionId use getStationRegionId()
 */
export type station = {
    stationId: string,
    name: string,
    city: string,
    regionId: number,
    location: [number, number],
}

export type mapSegment = {
    stationIdA: string,
    stationIdB: string,
    segmentIdAB: number,
    segmentIdBA: number,
    locationA: [number, number],
    locationB: [number, number],
    busy: boolean,
}

export type trainStopInfo = {
    stationId: string,
    name: string,
    isFirstStop: boolean,
    isLastStop: boolean,
    isCurrentStop: boolean,
    expectedArrival: number,
    actualArrival: number,
    expectedDeparture: number,
    actualDeparture: number,
    delayAtArrival: number,
    delayAtDeparture: number,
    expectedPlatform: string | null,
    actualPlatform: string | null,
}

export type trainInfo = {
    departed: boolean,
    arrived: boolean,
    travelling: boolean,
    inStation: boolean,
    departureTime: number | null,
    segmentId: number,
    regionId: number,
    trainCategory: string,
    trainNumber: number,
    changingNumber: boolean,
    stationA: string,
    stationIdA: string,
    stationB: string,
    stationIdB: string,
    travelDuration: number | null,
    delay: number,
    latestDetection: number,
    expectedPlatform: string | null,
    actualPlatform: string | null,
    arrivalTime: number | null,
}