#[allow(unused_field)]
module one_portrait::kakera;

public struct Kakera has key {
    id: UID,
    unit_id: ID,
    athlete_id: u16,
    submitter: address,
    walrus_blob_id: vector<u8>,
    submission_no: u64,
    minted_at_ms: u64,
}
