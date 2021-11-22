import {FileId, UserId} from "./common";

export interface ApiFileResponse {
    id: FileId;
    details: {
        name: string;
        sound: string;
        animal: string;
        source: string;
        description: string;
        originalName: string;
    };
    userId: UserId;
}
