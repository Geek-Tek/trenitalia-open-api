export type mapStation = {
    stationId: string,
    name: string,
    city: string,
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