import { QnAPushNotificationManager } from "./QnAPushNotificationManager";

export interface QnAPushNotificationHandler {
    registerPushNotification(qnaPushManger: QnAPushNotificationManager): void;
}
