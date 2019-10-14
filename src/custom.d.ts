declare var __kalturaplayerdata: { [key: string]: any };
declare var KalturaPlayer: any;

declare module "*.scss" {
    const content: { [className: string]: string };
    export = content;
}

declare module "*.svg" {
    const content: any;
    export default content;
}
