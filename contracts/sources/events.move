#[allow(unused_field)]
module one_portrait::events;

public struct SubmittedEvent has copy, drop {
    unit_id: ID,
    athlete_id: u16,
    submitter: address,
    walrus_blob_id: vector<u8>,
    submission_no: u64,
    submitted_count: u64,
    max_slots: u64,
}

public struct UnitFilledEvent has copy, drop {
    unit_id: ID,
    athlete_id: u16,
    filled_count: u64,
    max_slots: u64,
}

public struct MosaicReadyEvent has copy, drop {
    unit_id: ID,
    athlete_id: u16,
    master_id: ID,
    mosaic_walrus_blob_id: vector<u8>,
}
