import IntentList from './intent-list'
import APIContentType, { APIEditorInterfaces } from '../lib/interfaces/content-type'
import { ContentType } from '../lib/entities/content-type'
import * as _ from 'lodash'
import * as Bluebird from 'bluebird'
import APIFetcher from './interfaces/api-fetcher'

export default class Fetcher implements APIFetcher {
  private makeRequest: any

  constructor (makeRequest) {
    this.makeRequest = makeRequest
  }

  async getEntriesInIntents (intentList: IntentList): Promise<Array<Object>> {
    const ids: string[] = _.uniq(
      intentList.getIntents()
      .filter((intent) => intent.isContentTransform() || intent.isEntryDerive())
      .map((intent) => intent.getContentTypeId())
    )

    if (ids.length === 0) {
      return []
    }

    const response = await this.makeRequest({
      method: 'GET',
      url: `/entries?sys.contentType.sys.id[in]=${ids.join(',')}`
    })

    return response.items
  }

  async getContentTypesInChunks (intentList: IntentList): Promise<APIContentType[]> {
    const ids: string[] = _.uniq(intentList.getIntents()
      .filter((intent) => !intent.isEditorInterfaceUpdate())
      .reduce((ids, intent) => {
        const intentIds = intent.getRelatedContentTypeIds()
        return ids.concat(intentIds)
      }, [])
    )

    if (ids.length === 0) {
      return []
    }

    const response = await this.makeRequest({
      method: 'GET',
      url: `/content_types?sys.id[in]=${ids.join(',')}`
    })

    let contentTypes: APIContentType[] = response.items
    return contentTypes
  }

  async getEditorInterfacesInIntents (intentList: IntentList): Promise<Map<string, APIEditorInterfaces>> {
    const contentTypeIds: string[] = _.uniq(
      intentList.getIntents()
        .filter((intent) => intent.isEditorInterfaceUpdate())
        .reduce((ids, intent) => {
          const intentIds = intent.getRelatedContentTypeIds()
          return ids.concat(intentIds)
        }, [])
    )

    let editorInterfaces = new Map<string, APIEditorInterfaces>()

    if (contentTypeIds.length === 0) {
      return editorInterfaces
    }

    for (let id of contentTypeIds) {
      const response = await this.makeRequest({
        method: 'GET',
        url: `/content_types/${id}/editor_interface`
      })
      editorInterfaces.set(id, response)
    }
    return editorInterfaces
  }

  async getLocalesForSpace (): Promise<Array<string>> {
    const response = await this.makeRequest({
      method: 'GET',
      url: `/locales`
    })

    let locales: string[] = response.items.map((i) => i.code)
    return locales
  }

  async checkContentTypesForDeletedCts (intentList: IntentList, contentTypes: ContentType[]): Promise<ContentType[]> {
    const deletedCtIds: Set<string> = new Set(intentList.getIntents()
      .filter((intent) => intent.isContentTypeDelete())
      .map((intent) => intent.getContentTypeId())
    )

    if (deletedCtIds.size === 0) {
      return contentTypes
    }

    const self = this
    return Bluebird.map(contentTypes, async function (ct: any): Promise<ContentType> {
      if (deletedCtIds.has(ct.id)) {
        const response = await self.makeRequest({
          method: 'GET',
          url: `/entries?sys.contentType.sys.id=${ct.id}`
        })

        if (response.items.length > 0) {
          ct.hasEntries = true
        }
      }

      return ct
    })
  }
}
