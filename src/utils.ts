import { DataTimeFormatting } from "./components/kitchen-sink";

export class Utils {
    public static ONE_DAY_IN_MS: number = 1000 * 60 * 60 * 24;

    public static getDisplayDate(date: Date | null, formatting?: DataTimeFormatting) {
        if (!date) {
            return;
        }

        let dateString: string = "";
        if (formatting && formatting.dateFormatting === "American") {
            dateString = `${date.getMonth() + 1}/${date.getDate()}`;
        } else {
            // default European (day/month)
            dateString = `${date.getDate()}/${date.getMonth() + 1}`;
        }

        return dateString;
    }

    public static getDisplayTime(date: Date | null) {
        if (!date) {
            return;
        }

        let hours: number = date.getHours();
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        let minutes: string | number = date.getMinutes();
        minutes = minutes < 10 ? "0" + minutes : minutes;

        return `${hours}:${minutes} ${ampm}`;
    }

    public static isDateOlderThan24Hours(date: Date | null): boolean {
        if (!date) {
            return false;
        }

        return Date.now() - date.valueOf() >= Utils.ONE_DAY_IN_MS;
    }

    public static getEnumByEnumValue(myEnum: any, enumValue: string) {
        let keys = Object.keys(myEnum).filter(x => myEnum[x] == enumValue);
        return keys.length > 0 ? myEnum[keys[0]] : null;
    }

    public static getValueFromXml(xmlDoc: Document, key: string): string | null {
        let node: Element = xmlDoc.getElementsByTagName(key)[0];

        if (!node || !node.childNodes || !node.childNodes[0]) {
            return null;
        }

        return node.childNodes[0].nodeValue;
    }
}
