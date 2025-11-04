import { mapStation, mapSegment, trainStopInfo } from "./types"

import axios from 'axios'

/**
 *  Returns all the train stations with their ID and location
 *
 * @export
 * @return {*} {Promise<mapStation[]>} if empty it could be a server error or a change in the server API
 */
export async function getAllStations(): Promise<mapStation[]> {
    try {
        const response = await axios.get('http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/elencoStazioni/0')

        if (response.status === 200) {
            return response.data.map((el: any) => {
                return {
                    stationId: el.codStazione,
                    name: el.localita.nomeLungo,
                    city: el.nomeCitta,
                    location: [el.lat, el.lon]
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
 *  @return {*} a list of trains
 */
export async function getAllTrains(): Promise<any> {
    try {
        const segments = await getAllSegments(true) // getting only the unique lines so we avoid spamming ViaggiaTreno's server too much

        const infoTratte = segments.map(async el => await axios.get(`http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/dettagliTratta/0/${el.segmentIdAB}/${el.segmentIdBA}/ES*,IC,EXP,EC,EN,REG/null`))
        const allTrains = await Promise.all(infoTratte).then(response => {
            const data = response.map((el: any) => {
                return el.data.map((tr: any) => tr.treni).flat()
            }).flat()
            return data.filter((el: any) => !el.arrivato || !el.nonPartito).map((el: any) => {
                const [hours, minutes] = el.compDurata.split(':')
                const durataMin = (Number(hours) * 60) + Number(minutes)
                const newData = {
                    departed: !el.nonPartito,
                    arrived: el.arrivato,
                    travelling: el.circolante,
                    inStation: el.inStazione,
                    departureTime: el.dataPartenzaTreno,
                    segmentId: el.tratta,
                    regionId: el.regione,
                    trainCategory: el.categoria !== "" ? el.categoria : el.compNumeroTreno.trim().split(' ')[0], // For some reason, FR trains do not have a category, nor a category description, and have a space BEFORE the completed train number (e.g. " FR 9516")
                    trainNumber: el.numeroTreno,
                    changingNumber: el.haCambiNumero,
                    stationA: el.origine,
                    stationIdA: el.codOrigine,
                    stationB: el.destinazione,
                    stationIdB: el.codDestinazione,
                    travelDuration: durataMin,
                    delay: el.ritardo,
                    latestDetection: el.ultimoRilev,
                }
                return newData
            })
        })

        const noDuplicates = Array.from(
            new Map(
                allTrains.map(t => [`${t.trainNumber}-${t.regionId}`, t]) // the train number is not unique, two trains with the same number can travel in different regions
            ).values()
        )

        return noDuplicates
    } catch (err) {
        console.log(err)
        return err
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
                console.log(el)
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
 * @param {number} [segmentN=0] if more trains share the same id, specifies which train is desired
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
                            isCurrentStop: st.actualFermataType === 1 && (el.fermate[index +1].actualFermataType === 0 || !el.fermate[index +1]), // I'm not sure about this one, but I've noticed a change in this value when the train is in station
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