import ILoader = KalturaPlayerTypes.ILoader;

const {RequestBuilder} = KalturaPlayer.providers;
interface MessageResponse {
  metadataprofile: Array<Object>;
  cuepointAdd: Object;
  metadata: Object;
  cuepointUpdate: Object;
}
export class MessageLoader implements ILoader {
  _requestIndexCorrection: number;
  _missingProfileId: boolean;

  _requests: any[] = [];
  _response: MessageResponse = {
    metadataprofile: [],
    cuepointAdd: {},
    metadata: {},
    cuepointUpdate: {}
  };

  static get id(): string {
    return 'message';
  }

  /**
   * @constructor
   * @param {Object} params loader params
   */
  constructor(params: {missingProfileId: boolean; addCuePointArgs: any; addMetadataArgs: any; updateCuePointArgs: any}) {
    const headers: Map<string, string> = new Map();
    this._requestIndexCorrection = params.missingProfileId ? 1 : 0;
    this._missingProfileId = params.missingProfileId;

    // 1 - Conditional: Get meta data profile request
    if (this._missingProfileId) {
      const metadataProfileRequest = new RequestBuilder(headers);
      metadataProfileRequest.service = 'metadata_metadataprofile';
      metadataProfileRequest.action = 'list';
      metadataProfileRequest.params = {
        filter: {
          objectType: 'KalturaMetadataProfileFilter',
          systemNameEqual: 'Kaltura-QnA'
        }
      };
      this.requests.push(metadataProfileRequest);
    }

    // 2 - Add cuePoint request
    const addCuePointRequest = new RequestBuilder(headers);
    addCuePointRequest.service = 'cuepoint_cuepoint';
    addCuePointRequest.action = 'add';
    addCuePointRequest.params = {
      cuePoint: {
        objectType: 'KalturaAnnotation',
        ...params.addCuePointArgs
      }
    };
    this.requests.push(addCuePointRequest);

    // 3 - Add metadata request
    const addMetadataRequest = new RequestBuilder(headers);
    addMetadataRequest.service = 'metadata_metadata';
    addMetadataRequest.action = 'add';
    addMetadataRequest.params = {
      objectType: 'annotationMetadata.Annotation',
      ...params.addMetadataArgs
    };
    this.requests.push(addMetadataRequest);

    // 4 - Update cuePoint request
    const updateCuePointRequest = new RequestBuilder(headers);
    updateCuePointRequest.service = 'cuepoint_cuepoint';
    updateCuePointRequest.action = 'update';
    updateCuePointRequest.params = {
      ...params.updateCuePointArgs,
      cuePoint: {
        objectType: 'KalturaAnnotation',
        tags: 'qna'
      }
    };
    this.requests.push(updateCuePointRequest);
  }

  set requests(requests: any[]) {
    this._requests = requests;
  }

  get requests(): any[] {
    return this._requests;
  }

  set response(response: any) {
    this._response = response;
  }

  get response(): any {
    return this._response;
  }

  /**
   * Loader validation function
   * @function
   * @returns {boolean} Is valid
   */
  isValid(): boolean {
    return true;
  }
}
