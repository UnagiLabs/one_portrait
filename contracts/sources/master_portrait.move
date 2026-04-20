#[allow(unused_field)]
module one_portrait::master_portrait;

use sui::table::Table;

public struct MasterPortrait has key, store {
    id: UID,
    unit_id: ID,
    athlete_id: u16,
    mosaic_walrus_blob_id: vector<u8>,
    placements: Table<vector<u8>, Placement>,
}

public struct Placement has copy, drop, store {
    x: u16,
    y: u16,
    submitter: address,
    submission_no: u64,
}
