import { QnaMessage, QnaMessageType } from "./qnaMessageFactory";

const NewMessageTimeDelay = 5000;

export class Utils {
    public static ONE_DAY_IN_MS: number = 1000 * 60 * 60 * 24;

    public static getDisplayDate(date: Date | null, dateFormat: string) {
        if (!date) {
            return;
        }

        let dateString = Utils._convertPhpDateFormattingToJsDateFormatting(dateFormat);

        const d = date.getDate();
        const dd = d < 10 ? `0${d}` : d;

        const m = date.getMonth() + 1;
        const mm = m < 10 ? `0${m}` : m;

        const yyyy = date.getFullYear();

        if (dateString.match(/do/) != null) {
            let value;

            if (d === 1 || d === 11 || d === 21 || d === 31) value = `${d}st`;
            else if (d === 2 || d === 12 || d === 22) value = `${d}nd`;
            else if (d === 3 || d === 13 || d === 23) value = `${d}rd`;
            else value = `${d}th`;

            dateString = dateString.replace(/do/g, value);
        } else if (dateString.match(/dd/)) {
            dateString = dateString.replace(/dd/, dd.toString());
        } else if (dateString.match(/d/)) {
            dateString = dateString.replace(/d/, d.toString());
        }

        if (dateString.match(/mmmm/) != null) {
            const month = [
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December"
            ];
            dateString = dateString.replace(/mmmm/, month[m - 1]);
        } else if (dateString.match(/mm/)) {
            dateString = dateString.replace(/mm/, mm.toString());
        } else if (dateString.match(/m/)) {
            dateString = dateString.replace(/m/, m.toString());
        }

        dateString = dateString.replace(/yyyy/, yyyy.toString());

        return dateString;
    }

    private static _convertPhpDateFormattingToJsDateFormatting(dateFormat: string): string{
      if (dateFormat.indexOf('j') === -1) {
        return dateFormat;
      }

      // the list was taken from media-space and approved in `KMS-20129`
      switch (dateFormat) {
        case 'j.n.Y':
          dateFormat = 'd.m.yyyy';
          break;
        case 'j/n/Y':
          dateFormat = 'd/m/yyyy';
          break;
        case 'j F, Y':
          dateFormat = 'd mmmm, yyyy';
          break;
        case 'm/j/Y':
          dateFormat = 'mm/d/yyyy';
          break;
        case 'Y-n-j':
          dateFormat = 'yyyy-m-d';
          break;
        case 'F jS, Y':
          dateFormat = 'mmmm do, yyyy';
          break;
        default:
          dateFormat = 'dd/mm/yyyy';
      }

      return dateFormat;
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

    public static createXmlFromObject(obj: Record<string, any>): string {
        let xml = "<metadata>";
        for (let propertyName in obj) {
            xml += `<${propertyName}>${obj[propertyName]}</${propertyName}>`;
        }
        xml += "</metadata>";
        return xml;
    }

    public static findIndex<T>(arr: Array<T>, comparator: (item: T) => boolean): number {
        let index = 0;
        while (index < arr.length) {
            if (comparator(arr[index])) {
                return index;
            }
            index++;
        }
        return -1;
    }

    /**
     * Take the time of the newest QnaMessage
     */
    //todo [am] refactor this method
    public static threadTimeCompare(qnaMessage: QnaMessage): number {
        if (
            qnaMessage.type === QnaMessageType.Announcement ||
            qnaMessage.type === QnaMessageType.AnswerOnAir
        ) {
            return qnaMessage.createdAt.valueOf();
        }

        let q_time, a_time;

        if (qnaMessage.type === QnaMessageType.Answer) {
            a_time = qnaMessage.createdAt.valueOf();
        }

        if (qnaMessage.type === QnaMessageType.Question) {
            q_time = qnaMessage.createdAt.valueOf();
        }

        for (let i = 0; i < qnaMessage.replies.length; ++i) {
            let reply: QnaMessage = qnaMessage.replies[i];
            if (reply.type === QnaMessageType.Announcement) {
                if (!a_time) a_time = reply.createdAt.valueOf();
                else if (reply.createdAt.valueOf() > a_time) a_time = reply.createdAt.valueOf();
            }
        }

        if (!a_time && !q_time) {
            // todo log("both a_time and q_time are undefined - data error");
            return 0;
        }

        if (!a_time) {
            return q_time || 0;
        }

        if (!q_time) {
            return a_time || 0;
        }

        return Math.max(a_time, q_time);
    }

    public static isMessageInTimeFrame(qnaMessage: QnaMessage) {
        return qnaMessage.createdAt.getTime() >= new Date().getTime() - NewMessageTimeDelay;
    }
}
