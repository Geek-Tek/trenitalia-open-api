import { station, mapSegment, trainStopInfo, trainInfo } from "./types"

import axios from 'axios'

/**
 *  Returns all the train stations with their ID and location (usually regId = 0 even if it's not)
 *
 * @export
 * @param {boolean} [visible=false] return only stations with correct map coordinates
 * @return {*} {Promise<station[]>} if empty it could be a server error or a change in the server API
 */
export async function getAllStations(visible: boolean = false): Promise<station[]> {
    try {
        const response = await axios.get('http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/elencoStazioni/0')

        if (response.status === 200) {
            var data = response.data
            if (visible) {
                data = response.data.filter((el: any) => el.dettZoomStaz.length > 0)
            }
            return data.map(formatStationInfo)
        } else {
            throw `Status Code: ${response.status} - ${response.statusText}`
        }
    } catch (err) {
        console.log(err)
        return []
    }
}

function formatStationInfo(station: any): station {
    return {
        stationId: station.codStazione,
        regionId: station.codReg,
        name: station.localita.nomeLungo,
        city: station.nomeCitta,
        location: [station.lat, station.lon]
    }
}

/**
 *  Returns all the segments a train can travel through
 *
 * @export
 * @param {boolean} [unique=false] (default: false) when true, returns only the segments with distinct starting departure and arriving points
 * @param {boolean} [busy=false] (default: false) when true, returns only the segments with some trains (sometimes ViaggaTreno malfunctions and many segments are shown as unoccupied)
 * @return {*}  {Promise<mapSegment[]>} if empty it could be a server error or a change in the server API
 */
export async function getAllSegments(unique: boolean = false, busy: boolean = false): Promise<mapSegment[]> {
    try {
        const response = await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/elencoTratte/0/6/ES*,IC,EXP,EC,EN,REG/null/${new Date().getTime()}`)

        if (response.status === 200) {
            var trainLines = response.data
            if (busy) {
                trainLines = trainLines.filter((el: any) => el.occupata)
            }
            if (unique) {
                trainLines = Array.from(
                    new Map(
                        trainLines.map((el: any) => [`${el.trattaAB}-${el.trattaBA}`, el])
                    ).values()
                )
            }

            return trainLines.map((el: any) => {
                return {
                    stationIdA: el.nodoA,
                    stationIdB: el.nodoB,
                    segmentIdAB: el.trattaAB,
                    segmentIdBA: el.trattaBA,
                    locationA: [el.latitudineA, el.longitudineA],
                    locationB: [el.latitudineB, el.longitudineB],
                    busy: el.occupata
                }
            })
        } else {
            throw `Status Code: ${response.status} - ${response.statusText}`
        }
    } catch (err) {
        console.log(err)
        return []
    }
}
/**
 *  This function returns all the trains travelling in this moment through the FS's lines
 * 
 *  @export
 *  @return {*} {Promise<trainInfo[]>} - a list of trains infos
 */
export async function getAllTrains(): Promise<trainInfo[]> {
    try {
        const segments = await getAllSegments(true) // getting only the unique lines so we avoid spamming ViaggiaTreno's server too much

        const infoTratte = segments.map(async el => await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/dettagliTratta/0/${el.segmentIdAB}/${el.segmentIdBA}/ES*,IC,EXP,EC,EN,REG/null`))
        const allTrains = await Promise.all(infoTratte).then(response => {
            const data = response.map((el: any) => {
                return el.data.map((tr: any) => tr.treni).flat()
            }).flat()
            return data.filter((el: any) => !el.arrivato || !el.nonPartito).map(parseTrainInfo) // filtering travelling trains
        })

        const noDuplicates = Array.from(
            new Map(
                allTrains.map(t => [`${t.trainNumber}-${t.regionId}`, t]) // the train number is not unique, two trains with the same number can travel in different regions
            ).values()
        )

        return noDuplicates
    } catch (err) {
        console.log(err)
        return []
    }
}
/**
 * Returns the region id of a station
 *
 * @export
 * @param {string} stationId the station id
 * @return {*} {Promise<number>} the region id
 */
export async function getStationRegionId(stationId: string): Promise<number> {
    try {
        const res = await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/regione/${stationId}`)
        if (res.status === 200) {
            return res.data
        } else {
            throw `Status Code: ${res.status} - ${res.statusText}`
        }
    } catch(err) {
        console.log(err)
        return -1
    }
}
/**
 * Gets more info about a train by its number
 *
 * @export
 * @param {(number | string)} trainNumber the train number
 * @return {*}  {Promise<any>} a list of possible trains, with departure station and the respective id
 */
export async function getTrainAutocomplete(trainNumber: number | string): Promise<any> {
    try {
        const res = await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/cercaNumeroTrenoTrenoAutocomplete/${trainNumber}`)
        if (res.status === 200) {
            const response = res.data.split('\n')
            const result = response.filter((el: any) => el !== "").map((el: any) => {
                const text = el.split('|') // text[0] usually holds general info, text[1] usually holds codes (e.g. "3914 - ANCONA - 03/11/25|3914-S07113-1762124400000")
                const newData = {
                    trainNumber: text[1].split('-')[0],
                    stationA: text[0].split(' - ')[1],
                    stationIdA: text[1].split('-')[1],
                }
                return newData
            })
            if (result.length === 0) {
                return []
            } else {
                return result
            }
        } else {
            throw 'code not 200'
        }
    } catch (err) {
        console.log(err)
        return err
    }
}
/**
 * Returns the info of just the train stops
 * (if you want all the train info, check getTrainInfo())
 *
 * @export
 * @param {(number | string)} trainNumber the train number
 * @param {string} [stationIdA] id of the departure station. If not provided, it will be searched
 * @param {number} [segmentN=0] if more trains share the same id, specifies which train is desired
 * @return {*} {Promise<trainStopInfo[]>} a list of the train's stops with their respsective infos
 */
export async function getTrainStopsInfo(trainNumber: number | string, stationIdA?: string, segmentN: number = 0): Promise<trainStopInfo[]> {
    try {
        const stationId = stationIdA ?? (await getTrainAutocomplete(trainNumber))[segmentN].stationIdA
        const res = await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/tratteCanvas/${stationId}/${trainNumber}/${new Date().getTime()}`)

        if (res.status === 200) {
            return res.data.map((el: any) => {
                return {
                    stationId: el.id,
                    name: el.stazione,
                    isFirstStop: el.first,
                    isLastStop: el.last,
                    isCurrentStop: el.stazioneCorrente,
                    expectedArrival: el.fermata.arrivo_teorico,
                    actualArrival: el.fermata.arrivoReale,
                    expectedDeparture: el.fermata.partenza_teorica,
                    actualDeparture: el.fermata.partenzaReale,
                    delayAtArrival: el.fermata.ritardoArrivo,
                    delayAtDeparture: el.fermata.ritardoPartenza,
                    expectedPlatform: el.first ? el.fermata.binarioProgrammatoPartenzaDescrizione : el.fermata.binarioProgrammatoArrivoDescrizione,
                    actualPlatform: el.first ? el.fermata.binarioEffettivoPartenzaDescrizione : el.fermata.binarioEffettivoArrivoDescrizione,
                }
            })
        } else {
            throw `Status Code: ${res.status} - ${res.statusText}`
        }
    } catch(err) {
        console.log(err)
        return []
    }
}
/**
 * Gets all the info of a train (like in InfoMobilità)
 *
 * @export
 * @param {(number | string)} trainNumber the train number
 * @param {string} [stationIdA] id of the departure station. If not provided, it will be searched
 * @param {number} [segmentN=0] if more trains share the same id, specifies which train is desired (by default the first suggested by Trenitalia)
 * @return {*} {Promise<any>} reformatted train info with its stops
 */
export async function getTrainInfo(trainNumber: number | string, stationIdA?: string, segmentN: number = 0): Promise<any> {
    try {
        const stationId = stationIdA ?? (await getTrainAutocomplete(trainNumber))[segmentN].stationIdA
        const res = await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/andamentoTreno/${stationId}/${trainNumber}/${new Date().getTime()}`)

        if (res.status === 200) {
            const el = res.data
            return {
                trainType: el.tipoTreno,
                suppressedStops: el.fermateSoppresse,
                lastDetection: el.oraUltimoRilevamento ? el.oraUltimoRilevamento : undefined,
                lastDetectionStationName: el.stazioneUltimoRilevamento !== '--' ? el.stazioneUltimoRilevamento : undefined,
                stationIdA: el.idOrigine,
                stationIdB: el.idDestinazione,
                nameA: el.origine,
                nameB: el.destinazione,
                hasArrived: el.arrivato,
                stops: [
                    ...el.fermate.map((st: any, index: number) => {
                        return {
                            name: st.stazione,
                            stationId: st.id,
                            delayAtArrival: st.arrivoReale ? st.ritardoArrivo : undefined,
                            delayAtDeparture: st.partenzaReale ? st.ritardoPartenza : undefined,
                            isFirstStop: st.tipoFermata === 'P',
                            isLastStop: st.tipoFermata === 'A',
                            isCurrentStop: st.actualFermataType === 1 && (!el.fermate[index +1] || el.fermate[index +1].actualFermataType === 0), // I'm not sure about this one, but I've noticed a change in this value when the train is in station
                            expectedArrival: st.arrivo_teorico,
                            actualArrival: st.arrivoReale,
                            expectedDeparture: st.partenza_teorica,
                            actualDeparture: st.partenzaReale,
                            expectedPlatform: st.tipoFermata === 'P' ? st.binarioProgrammatoPartenzaDescrizione : st.binarioProgrammatoArrivoDescrizione,
                            actualPlatform: st.tipoFermata === 'P' ? st.binarioEffettivoPartenzaDescrizione : st.binarioEffettivoArrivoDescrizione,
                        }
                    })
                ]
            }
        } else {
            throw 'code not 200'
        }
    } catch(err) {
        console.log(err)
        return err
    }
}
/**
 * If there are strikes or binary obstructions, they will be listed here
 *
 * @export
 * @return {*} {Promise<string[]>} list of all info provided
 */
export async function getMobilityInfo(): Promise<string[]> {
    try {
        const res = await axios.get('http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/infomobilitaRSSBox/false')
        if (res.status === 200) {
            const infoList = (res.data as string).split(/\n/).filter((info, index) => index % 2 === 1)
            const infos = infoList.map(info => info.split('>')[1].split("<")[0])
            return infos
        } else {
            throw 'code not 200'
        }
    } catch(err) {
        console.log(err)
        return []
    }
}
/**
 * Return some station info, or null if no station was found with that code
 *
 * @export
 * @param {string} stationId - The station code / id
 * @param {number} [regionId] - The station region code / id, if not provided it will be retrived via another get request (see getStationRegionId())
 * @return {*}  {(Promise<station | null>)}
 */
export async function getStationInfo(stationId: string, regionId?: number): Promise<station | null> {
    try {
        regionId = regionId ?? await getStationRegionId(stationId)
        if (regionId == -1) {
            return null
        } else {
            const info = await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/dettaglioStazione/${stationId}/${regionId}`)
            if (info.status === 200) {
                return formatStationInfo(info.data)
            } else {
                throw 'code not 200'
            }
        }
    } catch(err) {
        return null
    }
}

// REVIEW - These next two functions can be merged in one, like getStationTables()

/**
 * Get all trains departing from one specific station (no regionId needed)
 *
 * @export
 * @param {string} stationId - The station code / id
 * @return {*}  {Promise<trainInfo[]>} - An array of train infos about their travel status regarding the selected station (if interested in more infos, see getTrainInfo())
 */
export async function getDepartures(stationId: string): Promise<trainInfo[]> {
    // TODO - could be improved with iechub.rfi.it (more trains, more infos but defect-rounded delays and a long waiting)
    try {
        const dep = await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/partenze/${stationId}/${new Date()}`)
        if (dep.status === 200) {
            return dep.data.map(parseTrainInfo)
        } else {
            throw 'code not 200'
        }
    } catch(err) {
        console.log(err)
        return []
    }
}
/**
 * Get all trains arriving to one specific station (no regionId needed)
 *
 * @export
 * @param {string} stationId - The station code / id
 * @return {*}  {Promise<trainInfo[]>} - An array of train infos about their travel status regarding the selected station (if interested in more infos, see getTrainInfo())
 */
export async function getArrivals(stationId: string): Promise<trainInfo[]> {
    // TODO - could be improved with iechub.rfi.it (more trains, more infos but defect-rounded delays and a long waiting)
    try {
        const arr = await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/arrivi/${stationId}/${new Date()}`)
        if (arr.status === 200) {
            return arr.data.map(parseTrainInfo)
        } else {
            throw 'code not 200'
        }
    } catch (err) {
        return []
    }
}

function parseTrainInfo(train: any): trainInfo {
    const [hours, minutes] = train.compDurata.split(':')
    const durataMin = (Number(hours) * 60) + Number(minutes)

    const details = {
        departed: !train.nonPartito,
        arrived: train.arrivato,
        travelling: train.circolante,
        inStation: train.inStazione,
        departureTime: train.orarioPartenza,
        arrivalTime: train.orarioArrivo,
        segmentId: train.tratta,
        regionId: train.regione,
        trainCategory: train.categoria !== '' ? train.categoria : train.compNumeroTreno.split(' ')[1], // For some reason, FR trains do not have a category, nor a category description, and have a space BEFORE the completed train number (e.g. " FR 9516")
        trainNumber: train.numeroTreno,
        changingNumber: train.haCambiNumero,
        stationA: train.origine,
        stationIdA: train.codOrigine,
        stationB: train.destinazione,
        stationIdB: train.codDestinazione,
        travelDuration: train.compDurata === '' ? null : durataMin,
        delay: train.ritardo,
        latestDetection: train.ultimoRilev,
        expectedPlatform: train.binarioProgrammatoPartenzaDescrizione ?? train.binarioProgrammatoArrivoDescrizione,
        actualPlatform: train.binarioEffettivoPartenzaDescrizione ?? train.binarioEffettivoArrivoDescrizione,
    }
    return details
}