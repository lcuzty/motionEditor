export const convertBvhParseDataToMotionJSON = (...args: any[]) => { return { data: [] } }
export type BvhParseData = any
export type ParseBvhByProjectRequest = any
export type ProcessMotionHubBvhRequest = any
export const bvhParse = {
    parseStub: () => { }
}
export const bvhParseApi = {
    processMotionHubBvh: (...args: any[]) => { return Promise.resolve({ code: 200, data: {} }) },
    parseBvhByProject: (...args: any[]) => { return Promise.resolve({ code: 200, data: {} }) }
}
