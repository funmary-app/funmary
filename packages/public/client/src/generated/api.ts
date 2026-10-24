// このファイルは scripts/generate-client-types.ts が作る。手では直さない (pnpm generate:client)。

export interface paths {
    "/api/v1/lessons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 日付の範囲の授業を返す */
        get: operations["getApiV1Lessons"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/lessons/next": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 次の授業を返す。授業中ならその授業 (inProgress が true)。休講の授業は飛ばし、14 日先まで見て、なければ next が null */
        get: operations["getApiV1LessonsNext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timetable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 日付の範囲の授業 (時刻つき) と、授業の日に関わる事情 (振替授業日、全学の休講日、祝日) を返す */
        get: operations["getApiV1Timetable"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/timetable/week": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description date (省けば今日) を含む週 (月曜から日曜) の、曜日と時限の格子。画面の週の時間割と同じ並びで、クライアントでの整形が要らない。授業のない時限も cells に入る (lessons が空) */
        get: operations["getApiV1TimetableWeek"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/periods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 時限ごとの開始と終了の時刻 (日本時間) */
        get: operations["getApiV1Periods"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 履修登録した科目と、その曜日と時限 */
        get: operations["getApiV1Courses"];
        put?: never;
        /** @description 履修登録する。科目は、年度とシラバスの番号か、名前で指す (名前が複数の科目に当たったら、登録せず、409 で候補を返す)。登録済みなら、何も変えずに今の状態を返す。書き込みは、1 分あたり 20 回まで */
        post: operations["postApiV1Courses"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/academic-calendar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 年度の学期の期間と、その年度の祝日、全学の休講日、振替授業日 (year を省けば今日が属する年度) */
        get: operations["getApiV1AcademicCalendar"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 日付の範囲の休講、補講、教室変更を返す */
        get: operations["getApiV1Changes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subjects/{year}/{syllabusId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 授業の詳細を返す */
        get: operations["getApiV1SubjectsByYearBySyllabusId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 日付の範囲の、自分の予定と、時間割に加えたほかの人の予定 (繰り返しは回ごとに展開する) */
        get: operations["getApiV1Events"];
        put?: never;
        /** @description 自分の予定を足す。公開範囲は決められず、常に非公開で足す。書き込みは、1 分あたり 20 回まで */
        post: operations["postApiV1Events"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/events/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 自分の予定を 1 件、足すときと同じ形で返す。直すときは、この形から id を除いて送り直す */
        get: operations["getApiV1EventsById"];
        /** @description 自分の予定を、送った内容に置き換える (送らなかった項目は、空になる)。公開範囲は変わらない */
        put: operations["putApiV1EventsById"];
        post?: never;
        /** @description 自分の予定を消す。元には戻せない */
        delete: operations["deleteApiV1EventsById"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 休講や教室の変更のデータが新しいか。古いときは、反映が遅れているかもしれない */
        get: operations["getApiV1Status"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subjects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 年度 (省けば今年度) の科目を、名前、教員、授業コードで探す。公開の科目だけを、50 件まで返す */
        get: operations["getApiV1Subjects"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/subjects/{year}/{syllabusId}/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 科目のその年度の全授業日 (時刻、教室、休講、補講、教室変更を反映)。sequence は休講を除いた通し番号 */
        get: operations["getApiV1SubjectsByYearBySyllabusIdSessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bus/stops": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description バスの停留所と、時刻表の版の一覧。バスの機能を使わない設定のサーバーでは 404。取り込む前は stops が空 */
        get: operations["getApiV1BusStops"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bus/stops/{stopId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 1 つの停留所の発車表。generation (8 桁の版のコード) を省くと、今日に有効な版。取り込んでいなければ 404 */
        get: operations["getApiV1BusStopsByStopId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bus/next": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 今から先のバスの発車。stopId を省くと、強調する停留所 (未来大、亀田支所前)。limit は停留所ごとの件数で、既定は 3 */
        get: operations["getApiV1BusNext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bus/legs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 「A から未来大へ」「未来大から A へ」の発車。stopId は、未来大を通る任意の停留所 A。direction は toUniversity (A から未来大) か fromUniversity (未来大から A)。向きは、時刻表の経由と行き先の文字から決めるので、経由に書かれない停留所を通る便は、出ないことがある。day を省くと今日の区分 */
        get: operations["getApiV1BusLegs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courses/{year}/{syllabusId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description 履修登録を取り消す。自分だけの曜日と時限と略称は残るので、登録し直せば元に戻る */
        delete: operations["deleteApiV1CoursesByYearBySyllabusId"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courses/{year}/{syllabusId}/personal-slots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description 自分だけに使う曜日と時限を足す (同じ曜日と時限があれば、教室を上書きする)。ほかの利用者の時間割には効かない。履修登録した科目だけ。共有の枠は、ここからは書き込めない */
        put: operations["putApiV1CoursesByYearBySyllabusIdPersonalSlots"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courses/{year}/{syllabusId}/personal-slots/{weekday}/{period}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description 自分だけの曜日と時限を消す */
        delete: operations["deleteApiV1CoursesByYearBySyllabusIdPersonalSlotsByWeekdayByPeriod"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/courses/{year}/{syllabusId}/abbreviation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description 時間割のセルに出す、自分だけの略称を保存する。空にすると、正式名称を使う指定になる */
        put: operations["putApiV1CoursesByYearBySyllabusIdAbbreviation"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description 通知欄を返す */
        get: operations["getApiV1Notifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description 未読の通知をすべて既読にし、既読にした件数を返す */
        post: operations["postApiV1NotificationsRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notifications/{id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description 通知を 1 件、既読にして返す */
        post: operations["postApiV1NotificationsByIdRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description トークンの持ち主の情報と、トークンに許された範囲を返す */
        get: operations["getApiV1Me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface webhooks {
    notification: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 通知
         * @description 設定画面で登録した汎用の Webhook の URL に、通知のたびに POST する。2xx を返すと受け取り済みになる。410 を返すと、その Webhook への送信を止める。それ以外の失敗は、最大 5 回まで再送する。
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    /** @description 通知の ID。二重に受け取ったかを見分けるのに使う */
                    "webhook-id": string;
                    /** @description 送った時刻 (UNIX 秒)。古すぎるものは受け取らないようにする */
                    "webhook-timestamp": string;
                    /** @description `v1,<base64>` の形。`<webhook-id>.<webhook-timestamp>.<本文>` を、Webhook の署名の鍵 (whsec_...) で HMAC-SHA256 にしたもの。Standard Webhooks (https://www.standardwebhooks.com/) の形式 */
                    "webhook-signature": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description 通知の ID。HTTP ヘッダの webhook-id と同じ */
                        id: string;
                        /** @enum {string} */
                        type: "class.cancelled" | "class.makeup" | "class.room_changed" | "integration.failed" | "notice" | "term.started";
                        /** Format: date-time */
                        createdAt: string;
                        data: {
                            /** @description 人が読む題 */
                            title: string;
                            /** @description 人が読む本文 */
                            body?: string | null;
                            /** @description 押したときに開く、絶対の URL */
                            url?: string | null;
                            /** @description 休講などの通知のときだけ付く */
                            subject?: {
                                name: string;
                                url: string;
                            };
                            /** @description 日付 (YYYY-MM-DD)。休講などの通知のときだけ付く */
                            date?: string;
                            /** @description 時限。休講などの通知のときだけ付く */
                            period?: number;
                        };
                    };
                };
            };
            responses: {
                /** @description 受け取った */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description この Webhook はもう使わない。Funmary は送信を止める */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getApiV1Lessons: {
        parameters: {
            query: {
                start: string;
                end: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description YYYY-MM-DD (日本時間) */
                        date: string;
                        /** @description 時限の番号。時刻は start と end */
                        period: number;
                        /** @description HH:MM (日本時間)。時限の時刻が不明なら null */
                        start: string | null;
                        end: string | null;
                        subjectId: number;
                        subjectName: string;
                        academicYear: number;
                        syllabusId: string;
                        /** @description 教室。分からなければ null */
                        room: string | null;
                        /** @description 補講の教室が分からず、ふだんの教室を仮に出しているとき true */
                        roomIsTentative: boolean;
                        /** @description 休講、補講、教室変更の詳細。変更がなければ null */
                        change: {
                            comment: string | null;
                            /** @description 教室変更の移動元の教室 */
                            fromRoom: string | null;
                            /** @description 休講コメントにある補講の予定 (あり、なし、未定) */
                            makeupPlan: ("planned" | "none" | "undecided") | null;
                        } | null;
                        /**
                         * @description normal: 変更なし、cancelled: 休講、makeup: 補講、roomChanged: 教室変更
                         * @enum {string}
                         */
                        status: "normal" | "cancelled" | "makeup" | "roomChanged";
                    }[];
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1LessonsNext: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        next: {
                            /** @description YYYY-MM-DD (日本時間) */
                            date: string;
                            /** @description 時限の番号。時刻は start と end */
                            period: number;
                            /** @description HH:MM (日本時間)。時限の時刻が不明なら null */
                            start: string | null;
                            end: string | null;
                            subjectId: number;
                            subjectName: string;
                            academicYear: number;
                            syllabusId: string;
                            /** @description 教室。分からなければ null */
                            room: string | null;
                            /** @description 補講の教室が分からず、ふだんの教室を仮に出しているとき true */
                            roomIsTentative: boolean;
                            /** @description 休講、補講、教室変更の詳細。変更がなければ null */
                            change: {
                                comment: string | null;
                                /** @description 教室変更の移動元の教室 */
                                fromRoom: string | null;
                                /** @description 休講コメントにある補講の予定 (あり、なし、未定) */
                                makeupPlan: ("planned" | "none" | "undecided") | null;
                            } | null;
                            /**
                             * @description normal: 変更なし、cancelled: 休講、makeup: 補講、roomChanged: 教室変更
                             * @enum {string}
                             */
                            status: "normal" | "cancelled" | "makeup" | "roomChanged";
                            inProgress: boolean;
                        } | null;
                    };
                };
            };
        };
    };
    getApiV1Timetable: {
        parameters: {
            query: {
                start: string;
                end: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        lessons: {
                            /** @description YYYY-MM-DD (日本時間) */
                            date: string;
                            /** @description 時限の番号。時刻は start と end */
                            period: number;
                            /** @description HH:MM (日本時間)。時限の時刻が不明なら null */
                            start: string | null;
                            end: string | null;
                            subjectId: number;
                            subjectName: string;
                            academicYear: number;
                            syllabusId: string;
                            /** @description 教室。分からなければ null */
                            room: string | null;
                            /** @description 補講の教室が分からず、ふだんの教室を仮に出しているとき true */
                            roomIsTentative: boolean;
                            /** @description 休講、補講、教室変更の詳細。変更がなければ null */
                            change: {
                                comment: string | null;
                                /** @description 教室変更の移動元の教室 */
                                fromRoom: string | null;
                                /** @description 休講コメントにある補講の予定 (あり、なし、未定) */
                                makeupPlan: ("planned" | "none" | "undecided") | null;
                            } | null;
                            /**
                             * @description normal: 変更なし、cancelled: 休講、makeup: 補講、roomChanged: 教室変更
                             * @enum {string}
                             */
                            status: "normal" | "cancelled" | "makeup" | "roomChanged";
                        }[];
                        /** @description 授業の日の置き換え (振替授業日)、全学の休講日、祝日 */
                        days: ({
                            date: string;
                            /** @constant */
                            kind: "substitute";
                            /** @description この日に行う授業の曜日。1 (月) から 7 (日) */
                            weekday: number;
                        } | {
                            date: string;
                            /** @constant */
                            kind: "noClass";
                            label: string | null;
                        } | {
                            date: string;
                            /** @constant */
                            kind: "holiday";
                            name: string;
                        })[];
                        /** @description 学期の期間に、規則で推定した値を使った */
                        usesEstimatedTerms: boolean;
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1TimetableWeek: {
        parameters: {
            query?: {
                date?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description その週の月曜の日付 (YYYY-MM-DD) */
                        weekStart: string;
                        periods: {
                            number: number;
                            start: string;
                            end: string;
                        }[];
                        /** @description 月曜から日曜の 7 日 */
                        days: {
                            date: string;
                            /** @description 1 (月) から 7 (日) */
                            weekday: number;
                            /** @description 振替授業日、全学の休講日、祝日。なければ null */
                            note: ({
                                date: string;
                                /** @constant */
                                kind: "substitute";
                                /** @description この日に行う授業の曜日。1 (月) から 7 (日) */
                                weekday: number;
                            } | {
                                date: string;
                                /** @constant */
                                kind: "noClass";
                                label: string | null;
                            } | {
                                date: string;
                                /** @constant */
                                kind: "holiday";
                                name: string;
                            }) | null;
                            /** @description 時限の順。授業のない時限も入り、lessons が空になる */
                            cells: {
                                period: number;
                                lessons: {
                                    /** @description YYYY-MM-DD (日本時間) */
                                    date: string;
                                    /** @description 時限の番号。時刻は start と end */
                                    period: number;
                                    /** @description HH:MM (日本時間)。時限の時刻が不明なら null */
                                    start: string | null;
                                    end: string | null;
                                    subjectId: number;
                                    subjectName: string;
                                    academicYear: number;
                                    syllabusId: string;
                                    /** @description 教室。分からなければ null */
                                    room: string | null;
                                    /** @description 補講の教室が分からず、ふだんの教室を仮に出しているとき true */
                                    roomIsTentative: boolean;
                                    /** @description 休講、補講、教室変更の詳細。変更がなければ null */
                                    change: {
                                        comment: string | null;
                                        /** @description 教室変更の移動元の教室 */
                                        fromRoom: string | null;
                                        /** @description 休講コメントにある補講の予定 (あり、なし、未定) */
                                        makeupPlan: ("planned" | "none" | "undecided") | null;
                                    } | null;
                                    /**
                                     * @description normal: 変更なし、cancelled: 休講、makeup: 補講、roomChanged: 教室変更
                                     * @enum {string}
                                     */
                                    status: "normal" | "cancelled" | "makeup" | "roomChanged";
                                }[];
                            }[];
                        }[];
                        usesEstimatedTerms: boolean;
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1Periods: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        number: number;
                        /** @description HH:MM (日本時間) */
                        start: string;
                        end: string;
                    }[];
                };
            };
        };
    };
    getApiV1Courses: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subjectId: number;
                        academicYear: number;
                        syllabusId: string;
                        name: string;
                        teacher: string | null;
                        credits: number | null;
                        term: string;
                        slots: {
                            /** @description 1 (月) から 7 (日) */
                            weekday: number;
                            period: number;
                            room: string | null;
                        }[];
                    }[];
                };
            };
        };
    };
    postApiV1Courses: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    academicYear: number;
                    syllabusId: string;
                } | {
                    name: string;
                    academicYear?: number;
                };
            };
        };
        responses: {
            /** @description 登録後の状態 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subject: {
                            academicYear: number;
                            syllabusId: string;
                            name: string;
                            teacher: string | null;
                            credits: number | null;
                            term: string;
                        };
                        registered: boolean;
                        personalSlots: {
                            weekday: number;
                            period: number;
                            room: string | null;
                        }[];
                        /** @description 保存した略称。保存していなければ null、正式名称に戻す指定なら空文字 */
                        abbreviation: string | null;
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
            /** @description 科目が見つからない (ほかの人の非公開の科目も、見つからないことにする) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 名前が複数の科目に当たった (candidates に候補が入る) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getApiV1AcademicCalendar: {
        parameters: {
            query?: {
                year?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        academicYear: number;
                        terms: {
                            term: string;
                            start: string;
                            end: string;
                            /** @description manual、auto、estimated */
                            source: string;
                        }[];
                        days: ({
                            date: string;
                            /** @constant */
                            kind: "substitute";
                            /** @description この日に行う授業の曜日。1 (月) から 7 (日) */
                            weekday: number;
                        } | {
                            date: string;
                            /** @constant */
                            kind: "noClass";
                            label: string | null;
                        } | {
                            date: string;
                            /** @constant */
                            kind: "holiday";
                            name: string;
                        })[];
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1Changes: {
        parameters: {
            query: {
                start: string;
                end: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description YYYY-MM-DD (日本時間) */
                        date: string;
                        /** @description 時限の番号。時刻は start と end */
                        period: number;
                        /** @description HH:MM (日本時間)。時限の時刻が不明なら null */
                        start: string | null;
                        end: string | null;
                        subjectId: number;
                        subjectName: string;
                        academicYear: number;
                        syllabusId: string;
                        /** @description 教室。分からなければ null */
                        room: string | null;
                        /** @description 補講の教室が分からず、ふだんの教室を仮に出しているとき true */
                        roomIsTentative: boolean;
                        /** @description 休講、補講、教室変更の詳細。変更がなければ null */
                        change: {
                            comment: string | null;
                            /** @description 教室変更の移動元の教室 */
                            fromRoom: string | null;
                            /** @description 休講コメントにある補講の予定 (あり、なし、未定) */
                            makeupPlan: ("planned" | "none" | "undecided") | null;
                        } | null;
                        /**
                         * @description normal: 変更なし、cancelled: 休講、makeup: 補講、roomChanged: 教室変更
                         * @enum {string}
                         */
                        status: "normal" | "cancelled" | "makeup" | "roomChanged";
                    }[];
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1SubjectsByYearBySyllabusId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                year: number;
                syllabusId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subject: {
                            id: number;
                            academicYear: number;
                            syllabusId: string;
                            name: string;
                            teacher: string | null;
                            credits: number | null;
                            term: string;
                            /** @description 配当年次などの項目 */
                            attributes: {
                                [key: string]: string;
                            };
                            /** @description シラバスの内容 (授業の概要、到達目標など) */
                            syllabus: {
                                [key: string]: string;
                            };
                            syllabusUrl: string | null;
                            updatedAt: string;
                            /** @enum {string} */
                            source: "syllabus" | "user";
                            createdBy: string | null;
                            /** @enum {string} */
                            visibility: "public" | "link" | "private";
                        };
                        /** @description 休講、補講、教室変更の履歴 (新しい順) */
                        changes: {
                            /** @enum {string} */
                            kind: "cancellation" | "makeup" | "roomChange";
                            date: string;
                            period: number;
                            room: string | null;
                            fromRoom: string | null;
                            comment: string | null;
                            makeupPlan: ("planned" | "none" | "undecided") | null;
                            withdrawn: boolean;
                        }[];
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
            /** @description 科目がない、または見られない */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getApiV1Events: {
        parameters: {
            query: {
                start: string;
                end: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description 回ごとに決まる ID */
                        key: string;
                        eventId: number;
                        title: string;
                        location: string | null;
                        /** @description 自分の予定のメモ。ほかの人の予定を加えたものは null */
                        notes: string | null;
                        startDate: string;
                        /** @description この回の終わりの日 (この日を含む) */
                        endDate: string;
                        allDay: boolean;
                        /** @description HH:MM (日本時間)。時限で決めた予定は、時限の時刻。終日なら null */
                        start: string | null;
                        end: string | null;
                        /** @description 時限で決めた予定の、時限の範囲 */
                        periods: {
                            from: number;
                            to: number;
                        } | null;
                        /** @description ほかの人の予定を、自分の時間割に加えたもの */
                        added: boolean;
                    }[];
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    postApiV1Events: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                    location?: string | null;
                    notes?: string | null;
                    /**
                     * Format: date
                     * @description YYYY-MM-DD
                     */
                    startDate: string;
                    /** @description 省けば開始日と同じ */
                    endDate?: string | null;
                    time: {
                        /** @constant */
                        kind: "allDay";
                    } | {
                        /** @constant */
                        kind: "time";
                        /** @description HH:MM (日本時間) */
                        start: string;
                        /** @description HH:MM。始まりより後 */
                        end: string;
                    } | {
                        /** @constant */
                        kind: "period";
                        /** @description 始まりの時限 (1 から 6) */
                        from: number;
                        /** @description 終わりの時限 (始まり以上、6 まで) */
                        to: number;
                    };
                    /** @description 繰り返さないなら省くか null */
                    repeat?: {
                        /** @enum {string} */
                        freq: "daily" | "weekly" | "monthly" | "yearly";
                        /** @description 間隔 (1 から 99)。省けば 1 */
                        interval?: number;
                        /** @description weekly のとき。曜日 (月曜が 1、日曜が 7)。省けば開始日の曜日 */
                        weekdays?: number[];
                        /**
                         * @description monthly のとき。day は毎月の同じ日、nth は第何曜日、last は最終週の曜日
                         * @enum {string}
                         */
                        monthly?: "day" | "nth" | "last";
                        /** @description 省けば、終わりなし */
                        end?: {
                            /** @constant */
                            kind: "never";
                        } | {
                            /** @constant */
                            kind: "until";
                            /**
                             * Format: date
                             * @description YYYY-MM-DD
                             */
                            date: string;
                        } | {
                            /** @constant */
                            kind: "count";
                            count: number;
                        };
                    } | null;
                    /** @description 繰り返しから除く日 (始まりの日で数える) */
                    excludedDates?: string[];
                };
            };
        };
        responses: {
            /** @description 足した予定 */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: number;
                        title: string;
                        location?: string | null;
                        notes?: string | null;
                        /**
                         * Format: date
                         * @description YYYY-MM-DD
                         */
                        startDate: string;
                        /** @description 省けば開始日と同じ */
                        endDate?: string | null;
                        time: {
                            /** @constant */
                            kind: "allDay";
                        } | {
                            /** @constant */
                            kind: "time";
                            /** @description HH:MM (日本時間) */
                            start: string;
                            /** @description HH:MM。始まりより後 */
                            end: string;
                        } | {
                            /** @constant */
                            kind: "period";
                            /** @description 始まりの時限 (1 から 6) */
                            from: number;
                            /** @description 終わりの時限 (始まり以上、6 まで) */
                            to: number;
                        };
                        /** @description 繰り返さないなら省くか null */
                        repeat?: {
                            /** @enum {string} */
                            freq: "daily" | "weekly" | "monthly" | "yearly";
                            /** @description 間隔 (1 から 99)。省けば 1 */
                            interval?: number;
                            /** @description weekly のとき。曜日 (月曜が 1、日曜が 7)。省けば開始日の曜日 */
                            weekdays?: number[];
                            /**
                             * @description monthly のとき。day は毎月の同じ日、nth は第何曜日、last は最終週の曜日
                             * @enum {string}
                             */
                            monthly?: "day" | "nth" | "last";
                            /** @description 省けば、終わりなし */
                            end?: {
                                /** @constant */
                                kind: "never";
                            } | {
                                /** @constant */
                                kind: "until";
                                /**
                                 * Format: date
                                 * @description YYYY-MM-DD
                                 */
                                date: string;
                            } | {
                                /** @constant */
                                kind: "count";
                                count: number;
                            };
                        } | null;
                        /** @description 繰り返しから除く日 (始まりの日で数える) */
                        excludedDates?: string[];
                    };
                };
            };
            /** @description 入力が正しくない (message に、直し方が分かる文が入る) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getApiV1EventsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: number;
                        title: string;
                        location?: string | null;
                        notes?: string | null;
                        /**
                         * Format: date
                         * @description YYYY-MM-DD
                         */
                        startDate: string;
                        /** @description 省けば開始日と同じ */
                        endDate?: string | null;
                        time: {
                            /** @constant */
                            kind: "allDay";
                        } | {
                            /** @constant */
                            kind: "time";
                            /** @description HH:MM (日本時間) */
                            start: string;
                            /** @description HH:MM。始まりより後 */
                            end: string;
                        } | {
                            /** @constant */
                            kind: "period";
                            /** @description 始まりの時限 (1 から 6) */
                            from: number;
                            /** @description 終わりの時限 (始まり以上、6 まで) */
                            to: number;
                        };
                        /** @description 繰り返さないなら省くか null */
                        repeat?: {
                            /** @enum {string} */
                            freq: "daily" | "weekly" | "monthly" | "yearly";
                            /** @description 間隔 (1 から 99)。省けば 1 */
                            interval?: number;
                            /** @description weekly のとき。曜日 (月曜が 1、日曜が 7)。省けば開始日の曜日 */
                            weekdays?: number[];
                            /**
                             * @description monthly のとき。day は毎月の同じ日、nth は第何曜日、last は最終週の曜日
                             * @enum {string}
                             */
                            monthly?: "day" | "nth" | "last";
                            /** @description 省けば、終わりなし */
                            end?: {
                                /** @constant */
                                kind: "never";
                            } | {
                                /** @constant */
                                kind: "until";
                                /**
                                 * Format: date
                                 * @description YYYY-MM-DD
                                 */
                                date: string;
                            } | {
                                /** @constant */
                                kind: "count";
                                count: number;
                            };
                        } | null;
                        /** @description 繰り返しから除く日 (始まりの日で数える) */
                        excludedDates?: string[];
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
            /** @description 予定が見つからない (ほかの人の予定も、見つからないことにする) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    putApiV1EventsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                    location?: string | null;
                    notes?: string | null;
                    /**
                     * Format: date
                     * @description YYYY-MM-DD
                     */
                    startDate: string;
                    /** @description 省けば開始日と同じ */
                    endDate?: string | null;
                    time: {
                        /** @constant */
                        kind: "allDay";
                    } | {
                        /** @constant */
                        kind: "time";
                        /** @description HH:MM (日本時間) */
                        start: string;
                        /** @description HH:MM。始まりより後 */
                        end: string;
                    } | {
                        /** @constant */
                        kind: "period";
                        /** @description 始まりの時限 (1 から 6) */
                        from: number;
                        /** @description 終わりの時限 (始まり以上、6 まで) */
                        to: number;
                    };
                    /** @description 繰り返さないなら省くか null */
                    repeat?: {
                        /** @enum {string} */
                        freq: "daily" | "weekly" | "monthly" | "yearly";
                        /** @description 間隔 (1 から 99)。省けば 1 */
                        interval?: number;
                        /** @description weekly のとき。曜日 (月曜が 1、日曜が 7)。省けば開始日の曜日 */
                        weekdays?: number[];
                        /**
                         * @description monthly のとき。day は毎月の同じ日、nth は第何曜日、last は最終週の曜日
                         * @enum {string}
                         */
                        monthly?: "day" | "nth" | "last";
                        /** @description 省けば、終わりなし */
                        end?: {
                            /** @constant */
                            kind: "never";
                        } | {
                            /** @constant */
                            kind: "until";
                            /**
                             * Format: date
                             * @description YYYY-MM-DD
                             */
                            date: string;
                        } | {
                            /** @constant */
                            kind: "count";
                            count: number;
                        };
                    } | null;
                    /** @description 繰り返しから除く日 (始まりの日で数える) */
                    excludedDates?: string[];
                };
            };
        };
        responses: {
            /** @description 直した予定 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: number;
                        title: string;
                        location?: string | null;
                        notes?: string | null;
                        /**
                         * Format: date
                         * @description YYYY-MM-DD
                         */
                        startDate: string;
                        /** @description 省けば開始日と同じ */
                        endDate?: string | null;
                        time: {
                            /** @constant */
                            kind: "allDay";
                        } | {
                            /** @constant */
                            kind: "time";
                            /** @description HH:MM (日本時間) */
                            start: string;
                            /** @description HH:MM。始まりより後 */
                            end: string;
                        } | {
                            /** @constant */
                            kind: "period";
                            /** @description 始まりの時限 (1 から 6) */
                            from: number;
                            /** @description 終わりの時限 (始まり以上、6 まで) */
                            to: number;
                        };
                        /** @description 繰り返さないなら省くか null */
                        repeat?: {
                            /** @enum {string} */
                            freq: "daily" | "weekly" | "monthly" | "yearly";
                            /** @description 間隔 (1 から 99)。省けば 1 */
                            interval?: number;
                            /** @description weekly のとき。曜日 (月曜が 1、日曜が 7)。省けば開始日の曜日 */
                            weekdays?: number[];
                            /**
                             * @description monthly のとき。day は毎月の同じ日、nth は第何曜日、last は最終週の曜日
                             * @enum {string}
                             */
                            monthly?: "day" | "nth" | "last";
                            /** @description 省けば、終わりなし */
                            end?: {
                                /** @constant */
                                kind: "never";
                            } | {
                                /** @constant */
                                kind: "until";
                                /**
                                 * Format: date
                                 * @description YYYY-MM-DD
                                 */
                                date: string;
                            } | {
                                /** @constant */
                                kind: "count";
                                count: number;
                            };
                        } | null;
                        /** @description 繰り返しから除く日 (始まりの日で数える) */
                        excludedDates?: string[];
                    };
                };
            };
            /** @description 入力が正しくない */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 予定が見つからない */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deleteApiV1EventsById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 消した */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
            /** @description 予定が見つからない */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getApiV1Status: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        timetable: {
                            /** @description 休講や教室の変更を最後に取れた日時 (ISO 8601)。一度も取れていなければ null */
                            lastSuccessAt: string | null;
                            /** @description 情報が古い。休講や教室の変更が、まだ反映されていないかもしれない */
                            stale: boolean;
                        };
                    };
                };
            };
        };
    };
    getApiV1Subjects: {
        parameters: {
            query?: {
                q?: string;
                year?: number;
                term?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subjects: {
                            academicYear: number;
                            syllabusId: string;
                            name: string;
                            teacher: string | null;
                            credits: number | null;
                            term: string;
                        }[];
                        truncated: boolean;
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1SubjectsByYearBySyllabusIdSessions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                year: number;
                syllabusId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subject: {
                            academicYear: number;
                            syllabusId: string;
                            name: string;
                            teacher: string | null;
                            credits: number | null;
                            term: string;
                        };
                        sessions: {
                            /** @description YYYY-MM-DD (日本時間) */
                            date: string;
                            /** @description 時限の番号。時刻は start と end */
                            period: number;
                            /** @description HH:MM (日本時間)。時限の時刻が不明なら null */
                            start: string | null;
                            end: string | null;
                            subjectId: number;
                            subjectName: string;
                            academicYear: number;
                            syllabusId: string;
                            /** @description 教室。分からなければ null */
                            room: string | null;
                            /** @description 補講の教室が分からず、ふだんの教室を仮に出しているとき true */
                            roomIsTentative: boolean;
                            /** @description 休講、補講、教室変更の詳細。変更がなければ null */
                            change: {
                                comment: string | null;
                                /** @description 教室変更の移動元の教室 */
                                fromRoom: string | null;
                                /** @description 休講コメントにある補講の予定 (あり、なし、未定) */
                                makeupPlan: ("planned" | "none" | "undecided") | null;
                            } | null;
                            /**
                             * @description normal: 変更なし、cancelled: 休講、makeup: 補講、roomChanged: 教室変更
                             * @enum {string}
                             */
                            status: "normal" | "cancelled" | "makeup" | "roomChanged";
                            sequence: number | null;
                        }[];
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1BusStops: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description 一覧を、時刻表の API に最後に確かめた日時 (ISO 8601)。まだ取り込んでいなければ null */
                        checkedAt: string | null;
                        generations: {
                            /** @description 版のコード。有効になる日の 8 桁 (例: 20261001) */
                            code: number;
                            name: string;
                            /** @description 一覧を取った日に、使われていた版か */
                            current: boolean;
                        }[];
                        stops: {
                            id: string;
                            name: string;
                            /** @description 既定で強調する停留所 (未来大、亀田支所前) */
                            highlighted: boolean;
                        }[];
                    };
                };
            };
        };
    };
    getApiV1BusStopsByStopId: {
        parameters: {
            query?: {
                generation?: string;
            };
            header?: never;
            path: {
                stopId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        stop: {
                            id: string;
                            name: string;
                        };
                        generation: {
                            /** @description 版のコード。有効になる日の 8 桁 (例: 20261001) */
                            code: number;
                            name: string;
                            /** @description 一覧を取った日に、使われていた版か */
                            current: boolean;
                        };
                        /** @description 時刻表の API が事業者から、この発車表を取った日時 (ISO 8601) */
                        fetchedAt: string | null;
                        /** @description Funmary が時刻表の API に最後に確かめた日時 */
                        checkedAt: string;
                        /** @description のりばと曜日の区分ごとの発車表 */
                        platforms: {
                            platformNo: number;
                            platformName: string | null;
                            /**
                             * @description holiday は土曜、日曜、祝日
                             * @enum {string}
                             */
                            day: "weekday" | "holiday";
                            /** @description 事業者の注意書き。印の意味もここにある */
                            notes: string[];
                            departures: {
                                /** @description HH:MM (日本時間)。24 時以降は 24:10 のように書く */
                                time: string;
                                routes: string[];
                                via: string | null;
                                destination: string | null;
                                marks: string[];
                            }[];
                        }[];
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1BusNext: {
        parameters: {
            query?: {
                stopId?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        stops: {
                            stop: {
                                id: string;
                                name: string;
                            };
                            generation: {
                                /** @description 版のコード。有効になる日の 8 桁 (例: 20261001) */
                                code: number;
                                name: string;
                                /** @description 一覧を取った日に、使われていた版か */
                                current: boolean;
                            } | null;
                            checkedAt: string | null;
                            /** @description 今から先の発車。発車表がまだなければ空 */
                            upcoming: {
                                /** @description その発車が属するダイヤの日。24 時以降の発車は、日付が変わったあとも前日 */
                                serviceDate: string;
                                time: string;
                                minutesUntil: number;
                                platformNo: number;
                                platformName: string | null;
                                routes: string[];
                                via: string | null;
                                destination: string | null;
                                marks: string[];
                            }[];
                            platforms: {
                                platformNo: number;
                                platformName: string | null;
                                notes: string[];
                            }[];
                        }[];
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    getApiV1BusLegs: {
        parameters: {
            query: {
                stopId: string;
                direction: "toUniversity" | "fromUniversity";
                day?: "weekday" | "holiday";
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description 選んだ停留所 A */
                        stop: {
                            id: string;
                            name: string;
                        };
                        /** @enum {string} */
                        direction: "toUniversity" | "fromUniversity";
                        /** @description 乗る停留所 */
                        from: {
                            id: string;
                            name: string;
                        };
                        /** @description 降りる停留所 */
                        to: {
                            id: string;
                            name: string;
                        };
                        /**
                         * @description 発車を並べた日の区分。holiday は土曜、日曜、祝日
                         * @enum {string}
                         */
                        day: "weekday" | "holiday";
                        /** @enum {string} */
                        todayDay: "weekday" | "holiday";
                        generation: {
                            /** @description 版のコード。有効になる日の 8 桁 (例: 20261001) */
                            code: number;
                            name: string;
                            /** @description 一覧を取った日に、使われていた版か */
                            current: boolean;
                        } | null;
                        checkedAt: string | null;
                        /** @description その区分の、この向きの発車のすべて。時刻の順 */
                        departures: {
                            /** @description HH:MM (日本時間)。24 時以降は 24:10 のように書く */
                            time: string;
                            /** @description この便に乗る停留所。亀田支所前から先で路線が分かれるので、選んだ停留所を通らない系統の便は、亀田支所前と未来大の間になる */
                            from: {
                                id: string;
                                name: string;
                            };
                            /** @description この便で降りる停留所 */
                            to: {
                                id: string;
                                name: string;
                            };
                            platformNo: number;
                            platformName: string | null;
                            routes: string[];
                            via: string | null;
                            destination: string | null;
                            marks: string[];
                            /** @description 降りる停留所に着く時刻 (HH:MM)。到着する停留所の発車表から、同じ行き先と系統の便を結んで求めるので、結べなければ null */
                            arrivalTime: string | null;
                        }[];
                        /** @description これからの発車 (day が今日の区分のときだけ。違えば空) */
                        upcoming: {
                            /** @description HH:MM (日本時間)。24 時以降は 24:10 のように書く */
                            time: string;
                            /** @description この便に乗る停留所。亀田支所前から先で路線が分かれるので、選んだ停留所を通らない系統の便は、亀田支所前と未来大の間になる */
                            from: {
                                id: string;
                                name: string;
                            };
                            /** @description この便で降りる停留所 */
                            to: {
                                id: string;
                                name: string;
                            };
                            platformNo: number;
                            platformName: string | null;
                            routes: string[];
                            via: string | null;
                            destination: string | null;
                            marks: string[];
                            /** @description その発車が属するダイヤの日。24 時以降の発車は、日付が変わったあとも前日 */
                            serviceDate: string;
                            minutesUntil: number;
                        }[];
                        notes: string[];
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
            /** @description 一覧にない停留所、または未来大そのもの */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deleteApiV1CoursesByYearBySyllabusId: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                year: string;
                syllabusId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 取り消し後の状態 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subject: {
                            academicYear: number;
                            syllabusId: string;
                            name: string;
                            teacher: string | null;
                            credits: number | null;
                            term: string;
                        };
                        registered: boolean;
                        personalSlots: {
                            weekday: number;
                            period: number;
                            room: string | null;
                        }[];
                        /** @description 保存した略称。保存していなければ null、正式名称に戻す指定なら空文字 */
                        abbreviation: string | null;
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
            /** @description 科目がない、または履修登録していない */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    putApiV1CoursesByYearBySyllabusIdPersonalSlots: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                year: string;
                syllabusId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description 1 (月) から 6 (土) */
                    weekday: number;
                    /** @description 1 から 6 */
                    period: number;
                    /** @default null */
                    room?: string | null;
                };
            };
        };
        responses: {
            /** @description 書き込み後の状態 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subject: {
                            academicYear: number;
                            syllabusId: string;
                            name: string;
                            teacher: string | null;
                            credits: number | null;
                            term: string;
                        };
                        registered: boolean;
                        personalSlots: {
                            weekday: number;
                            period: number;
                            room: string | null;
                        }[];
                        /** @description 保存した略称。保存していなければ null、正式名称に戻す指定なら空文字 */
                        abbreviation: string | null;
                    };
                };
            };
            /** @description 曜日か時限が範囲の外 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 履修登録していない科目 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    deleteApiV1CoursesByYearBySyllabusIdPersonalSlotsByWeekdayByPeriod: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                year: string;
                syllabusId: string;
                weekday: string;
                period: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 消した後の状態 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subject: {
                            academicYear: number;
                            syllabusId: string;
                            name: string;
                            teacher: string | null;
                            credits: number | null;
                            term: string;
                        };
                        registered: boolean;
                        personalSlots: {
                            weekday: number;
                            period: number;
                            room: string | null;
                        }[];
                        /** @description 保存した略称。保存していなければ null、正式名称に戻す指定なら空文字 */
                        abbreviation: string | null;
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
            /** @description その曜日と時限は、登録されていない */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    putApiV1CoursesByYearBySyllabusIdAbbreviation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                year: string;
                syllabusId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description 100 文字まで。空にすると、正式名称を使う */
                    abbreviation: string;
                };
            };
        };
        responses: {
            /** @description 保存後の状態 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subject: {
                            academicYear: number;
                            syllabusId: string;
                            name: string;
                            teacher: string | null;
                            credits: number | null;
                            term: string;
                        };
                        registered: boolean;
                        personalSlots: {
                            weekday: number;
                            period: number;
                            room: string | null;
                        }[];
                        /** @description 保存した略称。保存していなければ null、正式名称に戻す指定なら空文字 */
                        abbreviation: string | null;
                    };
                };
            };
            /** @description 100 文字を超えている */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getApiV1Notifications: {
        parameters: {
            query?: {
                kinds?: string;
                since?: string;
                afterId?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: number;
                        kind: string;
                        title: string;
                        body: string | null;
                        link: string | null;
                        createdAt: string;
                    }[];
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
        };
    };
    postApiV1NotificationsRead: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        count: number;
                    };
                };
            };
        };
    };
    postApiV1NotificationsByIdRead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: number;
                        kind: string;
                        title: string;
                        body: string | null;
                        link: string | null;
                        createdAt: string;
                    };
                };
            };
            /** @description Validation Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        success: false;
                        error: unknown[];
                        data: unknown;
                    };
                };
            };
            /** @description 通知が見つからない */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getApiV1Me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        email: string;
                        /** @description このトークンに許された範囲 */
                        scopes: string[];
                    };
                };
            };
        };
    };
}
