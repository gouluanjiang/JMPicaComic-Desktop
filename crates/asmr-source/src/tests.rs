use super::*;

fn query() -> AsmrListQuery {
    AsmrListQuery {
        order: AsmrOrder::Added,
        ascending: false,
        page: 2,
        page_size: 24,
        subtitle_only: true,
    }
}

fn synthetic_work(id: u64) -> Value {
    json!({
        "id": id,
        "source_id": format!("RJ{id:08}"),
        "title": "合成作品\u{0007}标题",
        "circle_id": 7,
        "name": "合成社团",
        "circle": {"id": 7, "name": "合成社团", "source_id": "RG00000007"},
        "vas": [
            {"id": "2072e5eb-e1e1-5fbc-8af5-d118ef8c1d20", "name": "合成声优"},
            {"id": "../escape", "name": "无效"}
        ],
        "tags": [
            {"id": 4, "name": "旧名", "i18n": {"zh-cn": {"name": "亲热/甜蜜"}, "ja-jp": {"name": "ラブラブ"}}},
            {"id": "x", "name": "无效"}
        ],
        "release": "2026-10-02",
        "create_date": "2026-11-01T00:00:00.000Z",
        "dl_count": 1234,
        "rate_average_2dp": 4.62,
        "rate_count": 50,
        "review_count": 3,
        "price": 330,
        "duration": 2717,
        "has_subtitle": true,
        "nsfw": true,
        "mainCoverUrl": "https://example.invalid/never-forwarded.jpg",
        "language_editions": [
            {"lang": "JPN", "label": "日本語", "workno": "RJ01671143"},
            {"lang": "CHI_HANS", "label": "简体中文", "workno": "RJ01683350"},
            {"lang": "X", "label": "bad", "workno": "../../etc"}
        ]
    })
}

fn reply(status: u16, body: Value) -> Reply {
    Ok((status, serde_json::to_vec(&body).unwrap()))
}

#[test]
fn works_are_normalized_without_remote_urls() {
    let work = types::work(&synthetic_work(1683351)).unwrap();
    assert_eq!(work.code, "RJ01683351");
    assert_eq!(work.title, "合成作品标题");
    assert_eq!(
        work.circle,
        Some(AsmrCircle {
            id: 7,
            name: "合成社团".into()
        })
    );
    assert_eq!(work.voice_actors.len(), 1);
    assert_eq!(
        work.tags,
        vec![AsmrTag {
            id: 4,
            name: "亲热/甜蜜".into()
        }]
    );
    assert_eq!(work.release.as_deref(), Some("2026-10-02"));
    assert_eq!(work.added.as_deref(), Some("2026-11-01"));
    assert_eq!(work.rating, Some(4.62));
    assert_eq!(work.duration_seconds, Some(2717));
    assert_eq!(work.editions.len(), 2);
    let serialized = serde_json::to_string(&work).unwrap();
    assert!(!serialized.contains("example.invalid"));
    assert!(!serialized.contains("http"));
}

#[test]
fn unrated_works_have_no_rating_and_codes_are_derived_when_missing() {
    let mut value = synthetic_work(123456);
    value["rate_count"] = json!(0);
    value["source_id"] = json!("not a code");
    let work = types::work(&value).unwrap();
    assert_eq!(work.rating, None);
    assert_eq!(work.code, "RJ123456");
    value["title"] = json!("   ");
    assert_eq!(
        types::work(&value).unwrap_err().code,
        "ASMR_RESPONSE_INVALID"
    );
}

#[test]
fn a_malformed_record_does_not_hide_the_rest_of_a_page() {
    let page = types::page(&json!({
        "works": [synthetic_work(1), {"id": "bad"}, synthetic_work(2)],
        "pagination": {"currentPage": 2, "pageSize": 24, "totalCount": 62978}
    }))
    .unwrap();
    assert_eq!(page.works.len(), 2);
    assert_eq!((page.page, page.page_size, page.total), (2, 24, 62978));
    assert!(types::page(&json!({"works": "x"})).is_err());
}

#[test]
fn indexes_prefer_chinese_names_and_reject_unsafe_ids() {
    let entries = types::index(&json!([
        {"id": 509, "name": "3D作品", "i18n": {"zh-cn": {"name": "3D作品（中）"}}, "count": 37},
        {"id": "2072e5eb-e1e1-5fbc-8af5-d118ef8c1d20", "name": "合成声优", "count": 5},
        {"id": "../x", "name": "bad", "count": 1},
        {"id": 3, "name": "", "count": 1}
    ]))
    .unwrap();
    assert_eq!(
        entries,
        vec![
            AsmrIndexEntry {
                id: "509".into(),
                name: "3D作品（中）".into(),
                count: 37
            },
            AsmrIndexEntry {
                id: "2072e5eb-e1e1-5fbc-8af5-d118ef8c1d20".into(),
                name: "合成声优".into(),
                count: 5
            },
        ]
    );
}

#[test]
fn track_trees_keep_structure_and_keep_media_urls_native() {
    let cdn = "https://raw.kiko-play-niptan.one/media/stream/daily/RJ01683351/01.wav";
    let (tracks, media) = types::tracks(
        &json!([
            {"type": "folder", "title": "WAV", "children": [
                {"type": "audio", "title": "01.wav", "size": 1000, "duration": 61.5,
                 "hash": "1683351/11", "mediaStreamUrl": cdn,
                 "mediaDownloadUrl": "https://example.invalid/b"},
                {"type": "text", "title": "01.wav.vtt", "size": 10, "hash": "1683351/12",
                 "mediaStreamUrl": "https://api.asmr-200.com/api/media/stream/1683351/12"},
                {"type": "folder", "title": "", "children": []}
            ]},
            {"type": "audio", "title": "PV.MP4", "hash": "1683351/13",
             "mediaStreamUrl": "https://raw.kiko-play-niptan.one/pv.mp4"},
            {"type": "image", "title": "cover.png", "hash": "1683351/14",
             "mediaStreamUrl": "https://example.invalid/cover.png"},
            {"type": "audio", "title": "other-work.mp3", "hash": "999/15",
             "mediaStreamUrl": cdn},
            {"type": "audio", "title": "port.mp3", "hash": "1683351/16",
             "mediaStreamUrl": "https://raw.kiko-play-niptan.one:8443/a.mp3"},
            {"type": "audio", "title": "lookalike.mp3", "hash": "1683351/17",
             "mediaStreamUrl": "https://evil-kiko-play-niptan.one/a.mp3"},
            {"type": "unknown", "title": "readme.pdf"}
        ]),
        1683351,
    )
    .unwrap();
    assert_eq!(tracks.len(), 7);
    let AsmrTrack::Folder { title, children } = &tracks[0] else {
        panic!("folder expected")
    };
    assert_eq!(title, "WAV");
    assert_eq!(children.len(), 2);
    assert_eq!(
        children[0],
        AsmrTrack::File {
            file_id: Some(11),
            kind: AsmrFileKind::Audio,
            title: "01.wav".into(),
            size: Some(1000),
            duration_seconds: Some(61.5)
        }
    );
    // Video files listed as audio are recognized by extension.
    assert!(matches!(
        tracks[1],
        AsmrTrack::File {
            file_id: Some(13),
            kind: AsmrFileKind::Video,
            ..
        }
    ));
    // Files without an allowed address, or from another work, cannot be opened.
    for (index, track) in tracks.iter().enumerate().skip(2) {
        assert!(
            matches!(track, AsmrTrack::File { file_id: None, .. }),
            "{index}"
        );
    }
    let ids: Vec<u64> = media.iter().map(|entry| entry.file_id).collect();
    assert_eq!(ids, vec![11, 12, 13]);
    assert_eq!(media[0].url.as_str(), cdn);
    assert_eq!(media[0].work_id, 1683351);
    assert_eq!(media[2].extension().as_deref(), Some("mp4"));
    let serialized = serde_json::to_string(&tracks).unwrap();
    assert!(!serialized.contains("kiko-play"));
    assert!(!serialized.contains("example.invalid"));
    assert!(serialized.contains(r#""fileId":11"#));
    assert!(serialized.contains(r#""kind":"video""#));
}

#[test]
fn byte_ranges_are_single_bounded_and_strict() {
    let parse = AsmrByteRange::parse;
    assert_eq!(
        parse(None).unwrap(),
        AsmrByteRange {
            start: 0,
            end: None
        }
    );
    let open = parse(Some("bytes=100-")).unwrap();
    assert_eq!(open.end, None);
    assert_eq!(open.capped_end(), 100 + MEDIA_CHUNK - 1);
    let closed = parse(Some("bytes=0-99")).unwrap();
    assert_eq!(closed.capped_end(), 99);
    for bad in [
        "bytes=-500",
        "bytes=0-1,5-9",
        "items=0-1",
        "bytes=9-1",
        "bytes=a-",
        "bytes=99999999999999999999-",
    ] {
        assert_eq!(
            parse(Some(bad)).unwrap_err().code,
            "ASMR_RANGE_INVALID",
            "{bad}"
        );
    }
    assert_eq!(
        parse_content_range("bytes 0-99/99018946"),
        Some((0, 99, Some(99018946)))
    );
    assert_eq!(parse_content_range("bytes 5-9/*"), Some((5, 9, None)));
    assert_eq!(parse_content_range("bytes 5-9/9"), None);
    assert_eq!(parse_content_range("bytes 9-5/100"), None);
    assert_eq!(media_type(Some("wav")), "audio/wav");
    assert_eq!(media_type(Some("mp4")), "video/mp4");
    assert_eq!(media_type(None), "application/octet-stream");
}

#[test]
fn subtitle_text_decodes_common_encodings() {
    assert_eq!(decode_text(b"\xef\xbb\xbfWEBVTT"), "WEBVTT");
    assert_eq!(decode_text(&[0xff, 0xfe, b'h', 0, 0x2d, 0x4e]), "h中");
    assert_eq!(decode_text(&[0xfe, 0xff, 0, b'h', 0x4e, 0x2d]), "h中");
    assert_eq!(decode_text(b"ok\xff"), "ok\u{fffd}");
}

#[test]
fn media_addresses_are_pinned() {
    for (url, allowed) in [
        ("https://raw.kiko-play-niptan.one/a.wav", true),
        ("https://api.asmr-200.com/api/media/stream/1/2", true),
        ("http://raw.kiko-play-niptan.one/a.wav", false),
        ("https://kiko-play-niptan.one/a.wav", false),
        ("https://user@raw.kiko-play-niptan.one/a.wav", false),
        ("https://raw.kiko-play-niptan.one.evil.test/a.wav", false),
        ("https://example.invalid/a.wav", false),
    ] {
        let url = Url::parse(url).unwrap();
        assert_eq!(types::allowed_media_url(&url), allowed, "{url}");
    }
}

#[test]
fn track_trees_are_bounded() {
    let mut node = json!({"type": "audio", "title": "deep.wav"});
    for _ in 0..20 {
        node = json!({"type": "folder", "title": "f", "children": [node]});
    }
    assert!(types::tracks(&json!([node]), 1).is_err());
    let wide: Vec<Value> = (0..6000)
        .map(|index| json!({"type": "audio", "title": format!("{index}.mp3")}))
        .collect();
    assert!(types::tracks(&json!(wide), 1).is_err());
}

#[test]
fn work_inputs_accept_ids_codes_and_links_only() {
    assert_eq!(parse_work_input("RJ01683351"), Some(1683351));
    assert_eq!(parse_work_input("rj123456"), Some(123456));
    assert_eq!(parse_work_input("1683351"), Some(1683351));
    assert_eq!(
        parse_work_input("https://www.asmr.one/work/RJ01683351?x=1"),
        Some(1683351)
    );
    for bad in ["", "RJ", "RJ12ab", "0", "RJ12345678901", "hello world"] {
        assert_eq!(parse_work_input(bad), None, "{bad}");
    }
    assert!(is_work_code("RJ01683351"));
    assert!(!is_work_code("RJ0168335a"));
}

#[tokio::test]
async fn listings_use_the_documented_query_and_fail_over_on_server_errors() {
    let source = AsmrSource::scripted(vec![
        Err("ASMR_NETWORK"),
        reply(502, json!({})),
        reply(
            200,
            json!({"works": [synthetic_work(5)], "pagination": {"currentPage": 2, "pageSize": 24, "totalCount": 1}}),
        ),
        reply(
            200,
            json!({"works": [], "pagination": {"currentPage": 1, "pageSize": 24, "totalCount": 0}}),
        ),
    ]);
    let page = source.works(query()).await.unwrap();
    assert_eq!(page.works.len(), 1);
    // The host that answered becomes the first choice.
    source.works(query()).await.unwrap();
    let urls: Vec<String> = source
        .recorded()
        .into_iter()
        .map(|(_, url, _)| url)
        .collect();
    assert_eq!(
        urls,
        vec![
            "https://api.asmr-200.com/api/works?order=create_date&sort=desc&page=2&pageSize=24&subtitle=1",
            "https://api.asmr-300.com/api/works?order=create_date&sort=desc&page=2&pageSize=24&subtitle=1",
            "https://api.asmr.one/api/works?order=create_date&sort=desc&page=2&pageSize=24&subtitle=1",
            "https://api.asmr.one/api/works?order=create_date&sort=desc&page=2&pageSize=24&subtitle=1",
        ]
    );
}

#[tokio::test]
async fn client_errors_are_answers_and_never_walk_the_host_list() {
    let source = AsmrSource::scripted(vec![reply(404, json!({"error": "x"}))]);
    assert_eq!(source.work(42).await.unwrap_err().code, "ASMR_NOT_FOUND");
    let source = AsmrSource::scripted(vec![reply(429, json!({}))]);
    assert_eq!(
        source.works(query()).await.unwrap_err().code,
        "ASMR_RATE_LIMITED"
    );
    assert_eq!(source.recorded().len(), 1);
}

#[tokio::test]
async fn every_host_failing_reports_the_last_failure() {
    let source = AsmrSource::scripted(vec![
        Err("ASMR_NETWORK"),
        Err("ASMR_NETWORK"),
        reply(503, json!({})),
    ]);
    assert_eq!(
        source.works(query()).await.unwrap_err().code,
        "ASMR_UNAVAILABLE"
    );
}

#[tokio::test]
async fn invalid_inputs_are_refused_before_any_request() {
    let source = AsmrSource::scripted(vec![]);
    let mut bad = query();
    bad.page = 0;
    assert!(source.works(bad).await.is_err());
    bad = query();
    bad.page_size = 500;
    assert!(source.works(bad).await.is_err());
    assert!(source.search("   ", query()).await.is_err());
    assert!(source.search(&"字".repeat(101), query()).await.is_err());
    assert!(source
        .related(AsmrRelation::Circle, "../1", query())
        .await
        .is_err());
    assert!(source
        .related(AsmrRelation::VoiceActor, "a/b", query())
        .await
        .is_err());
    assert!(source.work(0).await.is_err());
    assert!(source.cover(0, AsmrCoverSize::Main).await.is_err());
    assert!(source.recorded().is_empty());
}

#[tokio::test]
async fn search_popular_related_index_and_detail_requests_are_exact() {
    let empty =
        json!({"works": [], "pagination": {"currentPage": 1, "pageSize": 24, "totalCount": 0}});
    let source = AsmrSource::scripted(vec![
        reply(200, empty.clone()),
        reply(200, empty.clone()),
        reply(200, empty.clone()),
        reply(200, empty.clone()),
        reply(200, json!([])),
        reply(200, synthetic_work(1683351)),
        reply(200, json!([])),
    ]);
    source.search("rj1683351", query()).await.unwrap();
    source.search("耳 舐め/音", query()).await.unwrap();
    source.popular(1, 24, false).await.unwrap();
    source
        .related(
            AsmrRelation::VoiceActor,
            "2072e5eb-e1e1-5fbc-8af5-d118ef8c1d20",
            AsmrListQuery {
                order: AsmrOrder::Random,
                ..query()
            },
        )
        .await
        .unwrap();
    source.index(AsmrIndexKind::Circles).await.unwrap();
    let detail = source.work(1683351).await.unwrap();
    assert_eq!(detail.work.id, 1683351);
    let recorded = source.recorded();
    let urls: Vec<&str> = recorded.iter().map(|(_, url, _)| url.as_str()).collect();
    assert_eq!(
        urls,
        vec![
            "https://api.asmr-200.com/api/search/RJ01683351?order=create_date&sort=desc&page=2&pageSize=24&subtitle=1",
            "https://api.asmr-200.com/api/search/%E8%80%B3%20%E8%88%90%E3%82%81%2F%E9%9F%B3?order=create_date&sort=desc&page=2&pageSize=24&subtitle=1",
            "https://api.asmr-200.com/api/recommender/popular",
            "https://api.asmr-200.com/api/vas/2072e5eb-e1e1-5fbc-8af5-d118ef8c1d20/works?order=random&page=2&pageSize=24&subtitle=1",
            "https://api.asmr-200.com/api/circles/",
            "https://api.asmr-200.com/api/workInfo/1683351",
            "https://api.asmr-200.com/api/tracks/1683351?v=2",
        ]
    );
    assert_eq!(recorded[2].0, Method::POST);
    assert_eq!(
        recorded[2].2,
        Some(
            json!({"page": 1, "pageSize": 24, "subtitle": 0, "localSubtitledWorks": [], "withPlaylistStatus": []})
        )
    );
}

#[tokio::test]
async fn covers_are_sniffed_and_missing_covers_are_not_errors() {
    let jpeg = vec![0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];
    let source = AsmrSource::scripted(vec![
        Ok((200, jpeg)),
        Ok((404, Vec::new())),
        Ok((200, b"<html>challenge</html>".to_vec())),
    ]);
    let cover = source
        .cover(1683351, AsmrCoverSize::Thumbnail)
        .await
        .unwrap()
        .unwrap();
    assert!(cover.starts_with("data:image/jpeg;base64,"));
    assert_eq!(
        source.cover(1683351, AsmrCoverSize::Main).await.unwrap(),
        None
    );
    assert_eq!(
        source
            .cover(1683351, AsmrCoverSize::Main)
            .await
            .unwrap_err()
            .code,
        "ASMR_RESPONSE_INVALID"
    );
    let urls: Vec<String> = source
        .recorded()
        .into_iter()
        .map(|(_, url, _)| url)
        .collect();
    assert_eq!(
        urls[0],
        "https://api.asmr-200.com/api/cover/1683351.jpg?type=240x240"
    );
    assert_eq!(
        urls[1],
        "https://api.asmr-200.com/api/cover/1683351.jpg?type=main"
    );
}
