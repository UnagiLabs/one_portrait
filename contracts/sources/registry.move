module one_portrait::registry;

use sui::table::{Self as table, Table};

const EDUPLICATE_SLUG: u64 = 1;

public struct REGISTRY has drop {}

public struct AdminCap has key, store {
    id: UID,
}

public struct AthleteMetadata has copy, drop, store {
    display_name: vector<u8>,
    slug: vector<u8>,
    thumbnail_url: vector<u8>,
}

public struct Registry has key {
    id: UID,
    current_units: Table<u16, ID>,
    athlete_metadata: Table<u16, AthleteMetadata>,
    slug_to_athlete: Table<vector<u8>, u16>,
}

fun init(_witness: REGISTRY, ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    let registry = Registry {
        id: object::new(ctx),
        current_units: sui::table::new(ctx),
        athlete_metadata: sui::table::new(ctx),
        slug_to_athlete: sui::table::new(ctx),
    };

    transfer::transfer(admin_cap, tx_context::sender(ctx));
    transfer::share_object(registry);
}

public(package) fun current_unit_id(registry: &Registry, athlete_id: u16): Option<ID> {
    if (table::contains(&registry.current_units, athlete_id)) {
        option::some(*table::borrow(&registry.current_units, athlete_id))
    } else {
        option::none()
    }
}

public(package) fun athlete_metadata(
    registry: &Registry,
    athlete_id: u16,
): Option<AthleteMetadata> {
    if (table::contains(&registry.athlete_metadata, athlete_id)) {
        option::some(*table::borrow(&registry.athlete_metadata, athlete_id))
    } else {
        option::none()
    }
}

public(package) fun set_current_unit_if_missing(
    registry: &mut Registry,
    athlete_id: u16,
    unit_id: ID,
): bool {
    if (table::contains(&registry.current_units, athlete_id)) {
        false
    } else {
        table::add(&mut registry.current_units, athlete_id, unit_id);
        true
    }
}

public(package) fun set_current_unit(registry: &mut Registry, athlete_id: u16, unit_id: ID) {
    if (table::contains(&registry.current_units, athlete_id)) {
        *table::borrow_mut(&mut registry.current_units, athlete_id) = unit_id;
    } else {
        table::add(&mut registry.current_units, athlete_id, unit_id);
    }
}

public(package) fun upsert_athlete_metadata(
    _admin_cap: &AdminCap,
    registry: &mut Registry,
    athlete_id: u16,
    display_name: vector<u8>,
    slug: vector<u8>,
    thumbnail_url: vector<u8>,
) {
    if (table::contains(&registry.athlete_metadata, athlete_id)) {
        let previous = table::borrow(&registry.athlete_metadata, athlete_id);
        let previous_slug = copy previous.slug;

        if (previous_slug != slug) {
            assert!(!table::contains(&registry.slug_to_athlete, copy slug), EDUPLICATE_SLUG);
            let _ = table::remove(&mut registry.slug_to_athlete, previous_slug);
            table::add(&mut registry.slug_to_athlete, copy slug, athlete_id);
        };

        *table::borrow_mut(&mut registry.athlete_metadata, athlete_id) = AthleteMetadata {
            display_name,
            slug,
            thumbnail_url,
        };
    } else {
        assert!(!table::contains(&registry.slug_to_athlete, copy slug), EDUPLICATE_SLUG);
        table::add(&mut registry.slug_to_athlete, copy slug, athlete_id);
        table::add(
            &mut registry.athlete_metadata,
            athlete_id,
            AthleteMetadata {
                display_name,
                slug,
                thumbnail_url,
            },
        );
    }
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(REGISTRY {}, ctx);
}

#[test_only]
public fun current_unit_count_for_testing(registry: &Registry): u64 {
    table::length(&registry.current_units)
}

#[test_only]
public fun athlete_metadata_count_for_testing(registry: &Registry): u64 {
    table::length(&registry.athlete_metadata)
}

#[test_only]
public fun slug_count_for_testing(registry: &Registry): u64 {
    table::length(&registry.slug_to_athlete)
}

#[test_only]
public fun athlete_metadata_display_name_for_testing(metadata: &AthleteMetadata): vector<u8> {
    copy metadata.display_name
}

#[test_only]
public fun athlete_metadata_slug_for_testing(metadata: &AthleteMetadata): vector<u8> {
    copy metadata.slug
}

#[test_only]
public fun athlete_metadata_thumbnail_url_for_testing(metadata: &AthleteMetadata): vector<u8> {
    copy metadata.thumbnail_url
}
