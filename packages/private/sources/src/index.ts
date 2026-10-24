export {
	parseClassChangePage,
	type MakeupPlan,
	type ParseOptions,
	type ParseResult,
	type PortalCancellation,
	type PortalMakeup,
	type PortalRoomChange,
} from './portal/parse.ts';
export {
	fetchHolidays,
	HOLIDAY_CSV_URL,
	type FetchHolidaysDeps,
	type FetchHolidaysResult,
} from './holidays/fetch.ts';
export {
	decodeHolidayCsv,
	parseHolidayCsv,
	type Holiday,
	type HolidayParseResult,
} from './holidays/parse.ts';
export { estimateHolidays } from './holidays/estimate.ts';
export { bundledHolidays } from './holidays/bundled.ts';
export {
	PORTAL_MIN_INTERVAL_MS,
	clampPortalInterval,
	portalAttemptAllowed,
	type AttemptDecision,
} from './portal/throttle.ts';
export { fetchPortalPage, type FetchPortalDeps, type FetchPortalResult } from './portal/client.ts';
export { PORTAL_ORIGIN, type PortalFetch } from './portal/http.ts';
export {
	buildLoginBody,
	parseLoginForm,
	type LoginForm,
	type LoginFormResult,
} from './portal/login-form.ts';
export {
	parseSyllabusDetail,
	type SyllabusDetail,
	type SyllabusDetailResult,
} from './syllabus/detail.ts';
export {
	parseSyllabusList,
	type SyllabusListResult,
	type SyllabusListRow,
} from './syllabus/list.ts';
export {
	fetchSyllabusCatalog,
	type FailedSyllabusDetail,
	type FetchSyllabusDeps,
	type FetchSyllabusResult,
	type SyllabusEntry,
} from './syllabus/client.ts';
export { parseSearchForm, type SearchForm, type SearchFormResult } from './syllabus/list.ts';
export {
	extractPdfTextItems,
	parseTimetablePdf,
	type ExtractResult,
} from './timetable-pdf/extract.ts';
export {
	parseTimetableItems,
	type PdfTextItem,
	type Quarter,
	type TimetablePdfEntry,
	type TimetablePdfIntensive,
	type TimetablePdfResult,
} from './timetable-pdf/grid.ts';
export {
	DEFAULT_TIMETABLE_PDF_OPTIONS,
	type TimetablePdfOptions,
	type TimetablePdfQuality,
} from './timetable-pdf/grid.ts';
export {
	IMPORT_PATH,
	buildBookmarklet,
	buildImportScript,
	collectTimetableCells,
	type RawCell,
} from './timetable-import/bookmarklet.ts';
export {
	decodeImportFragment,
	encodeImportPayload,
	parseImportPayload,
	roomFromLabel,
	type ImportPayloadResult,
	type ImportedCell,
} from './timetable-import/payload.ts';
export {
	extractPdfPages,
	parseAcademicCalendarPdf,
	type ExtractPagesResult,
} from './academic-calendar-pdf/extract.ts';
export {
	parseAcademicCalendarPages,
	type AcademicCalendarPdfResult,
	type NoClassDayCandidate,
	type PdfFillRect,
	type PdfPageContent,
} from './academic-calendar-pdf/calendar.ts';
export {
	ACADEMIC_INFO_URL,
	fetchAcademicCalendarPdf,
	findAcademicCalendarLinks,
	type AcademicCalendarLink,
	type FetchAcademicCalendarDeps,
	type FetchAcademicCalendarResult,
} from './academic-calendar-site/fetch.ts';
export {
	BusStopListSchema,
	BusStopTimetableSchema,
	fetchBusStopList,
	fetchBusStopTimetable,
	type FetchBusDeps,
	type FetchBusResult,
	type FetchBusStopListResult,
	type FetchBusStopTimetableResult,
	type FetchBusStopTimetableDeps,
} from './bus/fetch.ts';
