update "Tracks" set filtered=true
	where  not exists(
		select
						1
		from
						(
			select
							SUM(case when not tt.automatic and "tt"."what" in ('false-positive') then 1 else 0 end) "filtered",
							SUM(case when not tt.automatic and "tt"."what" not in ('false-positive') then 1 else 0 end) "animal",
							SUM(case when "tt"."data"#>>'{name}' = 'Master' and tt.automatic and "tt"."what" not in ('false-positive') then 1 else 0 end) "aianimal"
			from
							"TrackTags" tt
			where
							tt."TrackId" = "Tracks".id
						) as "cQ"
		where
				"filtered" = 0
			and ("animal" > 0
				or "aianimal">0)
				)
				
				
				