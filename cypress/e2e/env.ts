export const MANIFEST = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",AUTOSELECT=YES,DEFAULT=YES,URI="${location.origin}/media/index_1.m3u8",SUBTITLES="subs"
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=509496,RESOLUTION=480x272,AUDIO="audio",SUBTITLES="subs"
${location.origin}/media/index.m3u8`;

export const MANIFEST_SAFARI = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,LANGUAGE="en",URI="${location.origin}/media/index_1.m3u8"
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=504265,RESOLUTION=480x272,AUDIO="audio",SUBTITLES="subs"
${location.origin}/media/index.m3u8`;

export const preparePage = (puginConf = {}, playbackConf = {}): PromiseLike<any> => {
  return cy.visit('index.html').then($win => {
    try {
      // @ts-ignore
      $win.kalturaPlayer = $win.KalturaPlayer.setup({
        targetId: 'player-placeholder',
        provider: {
          partnerId: -1,
          env: {
            cdnUrl: 'http://mock-cdn',
            serviceUrl: 'http://mock-api'
          }
        },
        plugins: {
          qna: puginConf,
          uiManagers: {},
          kalturaCuepoints: {}
        },
        playback: {muted: true, ...playbackConf}
      });
      // @ts-ignore
      return $win.kalturaPlayer.loadMedia({entryId: '0_wifqaipd'}).then(() => $win.kalturaPlayer);
    } catch (e: any) {
      Cypress.log({
        name: 'preparePage got error',
        message: e.message
      });
      return Promise.reject(e.message);
    }
  });
};

const checkRequest = (reqBody: any, service: string, action: string) => {
  return reqBody?.service === service && reqBody?.action === action;
};

export const loadPlayer = (puginConf: Record<string, any> = {}, playbackConf: Record<string, any> = {}): PromiseLike<any> => {
  return preparePage(puginConf, playbackConf).then(kalturaPlayer => {
    if (playbackConf.autoplay) {
      return kalturaPlayer.ready().then(() => kalturaPlayer);
    }
    return kalturaPlayer;
  });
};

export const mockKalturaBe = (cuesFixture = 'cues.json') => {
  cy.intercept('http://mock-api/service/multirequest', req => {
    if (checkRequest(req.body[2], 'baseEntry', 'list')) {
      return req.reply({fixture: 'base_entry.json'});
    }
    if (checkRequest(req.body[2], 'cuepoint_cuepoint', 'list')) {
      return req.reply({fixture: cuesFixture});
    }
  });
};
