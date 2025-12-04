import {QnaPlugin} from './qna-plugin';
import {registerPlugin} from '@playkit-js/kaltura-player-js';

declare var __VERSION__: string;
declare var __NAME__: string;

const VERSION = __VERSION__;
const NAME = __NAME__;

export {QnaPlugin as Plugin};
export {VERSION, NAME};

export const pluginName: string = 'qna';
registerPlugin(pluginName, QnaPlugin as any);
