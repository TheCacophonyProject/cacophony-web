import {CacophonyApiClient} from "@typedefs/client/api";
import {LatLng} from "@shared/api/common";

export class SidekickSim {
    private api: CacophonyApiClient;
    private isOffline: boolean = false;
    constructor(api) {
        this.api = api;
    }
    public setLocation(location: LatLng, atTime: Date) {
        // Store a location at a given time for later sync
    }
}